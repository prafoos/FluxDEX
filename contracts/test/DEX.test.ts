import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";

describe("QMS DEX", function () {
  let owner: Signer;
  let trader: Signer;
  let tokenA: Contract;
  let tokenB: Contract;
  let wqms: Contract;
  let factory: Contract;
  let router: Contract;
  let pair: Contract;
  const unit = ethers.parseEther("1");
  const deadline = () => Math.floor(Date.now() / 1000) + 600;
  const asContract = (contract: Contract, signer: Signer): Contract =>
    contract.connect(signer) as Contract;

  beforeEach(async function () {
    [owner, trader] = await ethers.getSigners();
    const WQMS = await ethers.getContractFactory("WQMS");
    wqms = await WQMS.deploy();
    const Factory = await ethers.getContractFactory("DEXFactory");
    factory = await Factory.deploy();
    const Router = await ethers.getContractFactory("DEXRouter");
    router = await Router.deploy(await factory.getAddress(), await wqms.getAddress());
    const Token = await ethers.getContractFactory("MockERC20");
    tokenA = await Token.deploy("Token A", "TKA", ethers.parseEther("100000"), ethers.parseEther("1000"));
    tokenB = await Token.deploy("Token B", "TKB", ethers.parseEther("100000"), ethers.parseEther("1000"));
    await tokenA.approve(await router.getAddress(), ethers.MaxUint256);
    await tokenB.approve(await router.getAddress(), ethers.MaxUint256);
    await router.addLiquidity(
      await tokenA.getAddress(), await tokenB.getAddress(),
      ethers.parseEther("1000"), ethers.parseEther("2000"), 0, 0,
      await owner.getAddress(), deadline(),
    );
    const pairAddress = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
    pair = await ethers.getContractAt("DEXPair", pairAddress);
  });

  it("creates a unique pair and mints LP tokens", async function () {
    expect(await factory.allPairsLength()).to.equal(1);
    expect(await pair.totalSupply()).to.be.gt(0);
    expect(await pair.balanceOf(await owner.getAddress())).to.be.gt(0);
    await expect(factory.createPair(await tokenA.getAddress(), await tokenB.getAddress()))
      .to.be.revertedWith("Factory: pair exists");
  });

  it("adds and removes liquidity proportionally", async function () {
    const liquidityBefore = await pair.balanceOf(await owner.getAddress());
    await router.addLiquidity(
      await tokenA.getAddress(), await tokenB.getAddress(),
      ethers.parseEther("100"), ethers.parseEther("200"), 0, 0,
      await owner.getAddress(), deadline(),
    );
    expect(await pair.balanceOf(await owner.getAddress())).to.be.gt(liquidityBefore);
    const liquidity = await pair.balanceOf(await owner.getAddress());
    await pair.approve(await router.getAddress(), liquidity);
    await router.removeLiquidity(
      await tokenA.getAddress(), await tokenB.getAddress(), liquidity, 0, 0,
      await owner.getAddress(), deadline(),
    );
    expect(await pair.balanceOf(await owner.getAddress())).to.equal(0);
  });

  it("quotes and executes swaps with a 0.30% fee", async function () {
    const amountIn = ethers.parseEther("10");
    const quote = await router.getAmountsOut(amountIn, [await tokenA.getAddress(), await tokenB.getAddress()]);
    const token0 = await pair.token0();
    const reserveIn = token0 === await tokenA.getAddress() ? await pair.reserve0() : await pair.reserve1();
    const reserveOut = token0 === await tokenA.getAddress() ? await pair.reserve1() : await pair.reserve0();
    const amountInWithFee = amountIn * 997n;
    const expected = amountInWithFee * reserveOut / (reserveIn * 1000n + amountInWithFee);
    expect(quote[1]).to.equal(expected);
    const traderAddress = await trader.getAddress();
    await tokenA.transfer(traderAddress, amountIn);
    await asContract(tokenA, trader).approve(await router.getAddress(), amountIn);
    await asContract(router, trader).swapExactTokensForTokens(
      amountIn, quote[1], [await tokenA.getAddress(), await tokenB.getAddress()], traderAddress, deadline(),
    );
    expect(await tokenB.balanceOf(traderAddress)).to.equal(quote[1]);
  });

  it("reverts swaps below the requested minimum output", async function () {
    const amountIn = ethers.parseEther("1");
    await tokenA.approve(await router.getAddress(), amountIn);
    await expect(router.swapExactTokensForTokens(
      amountIn, ethers.MaxUint256,
      [await tokenA.getAddress(), await tokenB.getAddress()], await owner.getAddress(), deadline(),
    )).to.be.revertedWith("Router: insufficient output");
  });

  it("reverts expired transactions and protects the pair invariant", async function () {
    await expect(router.addLiquidity(
      await tokenA.getAddress(), await tokenB.getAddress(), unit, unit, 0, 0,
      await owner.getAddress(), 1,
    )).to.be.revertedWith("Router: expired");
    await expect(pair.swap(ethers.parseEther("1"), 0, await owner.getAddress()))
      .to.be.revertedWith("Pair: insufficient input");
  });

  it("wraps QMS and supports QMS-to-token swaps", async function () {
    await asContract(wqms, trader).deposit({ value: unit });
    expect(await wqms.balanceOf(await trader.getAddress())).to.equal(unit);
    await asContract(wqms, trader).withdraw(unit);
    expect(await wqms.balanceOf(await trader.getAddress())).to.equal(0);

    await router.addLiquidityQMS(
      await tokenA.getAddress(), ethers.parseEther("10"), 0, 0,
      await owner.getAddress(), deadline(), { value: unit },
    );
    const qmsPair = await factory.getPair(await wqms.getAddress(), await tokenA.getAddress());
    expect(qmsPair).not.to.equal(ethers.ZeroAddress);
    const quote = await router.getAmountsOut(unit, [await wqms.getAddress(), await tokenA.getAddress()]);
    await asContract(router, trader).swapExactQMSForTokens(
      quote[1], [await wqms.getAddress(), await tokenA.getAddress()],
      await trader.getAddress(), deadline(), { value: unit },
    );
    expect(await tokenA.balanceOf(await trader.getAddress())).to.equal(quote[1]);
  });

  it("removes QMS liquidity and supports token-to-QMS swaps", async function () {
    await router.addLiquidityQMS(
      await tokenA.getAddress(), ethers.parseEther("10"), 0, 0,
      await owner.getAddress(), deadline(), { value: unit },
    );
    const pairAddress = await factory.getPair(await wqms.getAddress(), await tokenA.getAddress());
    const qmsPair = await ethers.getContractAt("DEXPair", pairAddress);
    const liquidity = (await qmsPair.balanceOf(await owner.getAddress())) / 10n;
    await qmsPair.approve(await router.getAddress(), liquidity);
    const tokenBalanceBefore = await tokenA.balanceOf(await owner.getAddress());
    await router.removeLiquidityQMS(
      await tokenA.getAddress(), liquidity, 0, 0, await owner.getAddress(), deadline(),
    );
    expect(await tokenA.balanceOf(await owner.getAddress())).to.be.gt(tokenBalanceBefore);

    const amountIn = ethers.parseEther("1");
    const traderAddress = await trader.getAddress();
    await tokenA.transfer(traderAddress, amountIn);
    await asContract(tokenA, trader).approve(await router.getAddress(), amountIn);
    const quote = await router.getAmountsOut(amountIn, [await tokenA.getAddress(), await wqms.getAddress()]);
    const supplyBeforeSwap = await wqms.totalSupply();
    const transaction = await asContract(router, trader).swapExactTokensForQMS(
      amountIn, quote[1], [await tokenA.getAddress(), await wqms.getAddress()], traderAddress, deadline(),
    );
    await transaction.wait();
    expect(await wqms.totalSupply()).to.be.lt(supplyBeforeSwap);
  });

  it("allows test-token faucet minting", async function () {
    const amount = ethers.parseEther("1000");
    const recipient = await trader.getAddress();
    await asContract(tokenA, trader).faucet();
    expect(await tokenA.balanceOf(recipient)).to.equal(amount);
  });
});
