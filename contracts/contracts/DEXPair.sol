// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20Pair {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
}

contract DEXPair {
    string public constant name = "QMS DEX LP";
    string public constant symbol = "QMS-LP";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    uint256 public reserve0;
    uint256 public reserve1;
    uint256 private unlocked = 1;
    address public immutable token0;
    address public immutable token1;
    address public immutable factory;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to);
    event Sync(uint256 reserve0, uint256 reserve1);

    modifier lock() {
        require(unlocked == 1, "Pair: locked");
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor(address token0_, address token1_, address factory_) {
        require(token0_ != address(0) && token1_ != address(0), "Pair: zero token");
        token0 = token0_;
        token1 = token1_;
        factory = factory_;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "Pair: insufficient allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function mint(address to) external lock returns (uint256 liquidity) {
        uint256 balance0 = IERC20Pair(token0).balanceOf(address(this));
        uint256 balance1 = IERC20Pair(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - reserve0;
        uint256 amount1 = balance1 - reserve1;
        if (totalSupply == 0) {
            liquidity = _sqrt(amount0 * amount1);
            require(liquidity > 1000, "Pair: insufficient liquidity");
            _mint(address(0), 1000);
            liquidity -= 1000;
        } else {
            liquidity = _min(amount0 * totalSupply / reserve0, amount1 * totalSupply / reserve1);
        }
        require(liquidity > 0, "Pair: insufficient liquidity minted");
        _mint(to, liquidity);
        _update(balance0, balance1);
        emit Mint(msg.sender, amount0, amount1);
    }

    function burn(address to) external lock returns (uint256 amount0, uint256 amount1) {
        uint256 liquidity = balanceOf[address(this)];
        uint256 supply = totalSupply;
        amount0 = liquidity * IERC20Pair(token0).balanceOf(address(this)) / supply;
        amount1 = liquidity * IERC20Pair(token1).balanceOf(address(this)) / supply;
        require(amount0 > 0 && amount1 > 0, "Pair: insufficient liquidity burned");
        _burn(address(this), liquidity);
        _safeTransfer(token0, to, amount0);
        _safeTransfer(token1, to, amount1);
        _update(IERC20Pair(token0).balanceOf(address(this)), IERC20Pair(token1).balanceOf(address(this)));
        emit Burn(msg.sender, amount0, amount1, to);
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to) external lock {
        require(amount0Out > 0 || amount1Out > 0, "Pair: insufficient output");
        uint256 old0 = reserve0;
        uint256 old1 = reserve1;
        require(amount0Out < old0 && amount1Out < old1, "Pair: insufficient liquidity");
        require(to != token0 && to != token1 && to != address(this), "Pair: invalid recipient");
        if (amount0Out > 0) _safeTransfer(token0, to, amount0Out);
        if (amount1Out > 0) _safeTransfer(token1, to, amount1Out);
        uint256 balance0 = IERC20Pair(token0).balanceOf(address(this));
        uint256 balance1 = IERC20Pair(token1).balanceOf(address(this));
        uint256 amount0In = balance0 > old0 - amount0Out ? balance0 - (old0 - amount0Out) : 0;
        uint256 amount1In = balance1 > old1 - amount1Out ? balance1 - (old1 - amount1Out) : 0;
        require(amount0In > 0 || amount1In > 0, "Pair: insufficient input");
        uint256 adjusted0 = balance0 * 1000 - amount0In * 3;
        uint256 adjusted1 = balance1 * 1000 - amount1In * 3;
        require(adjusted0 * adjusted1 >= old0 * old1 * 1_000_000, "Pair: invariant");
        _update(balance0, balance1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    function _update(uint256 balance0, uint256 balance1) private {
        reserve0 = balance0;
        reserve1 = balance1;
        emit Sync(balance0, balance1);
    }

    function _mint(address to, uint256 amount) private {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _burn(address from, uint256 amount) private {
        balanceOf[from] -= amount;
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }

    function _transfer(address from, address to, uint256 amount) private {
        require(to != address(0), "Pair: zero recipient");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(IERC20Pair.transfer.selector, to, amount));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "Pair: transfer failed");
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) { return a < b ? a : b; }

    function _sqrt(uint256 y) private pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) { z = x; x = (y / x + x) / 2; }
        } else if (y != 0) z = 1;
    }
}
