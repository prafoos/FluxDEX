// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20Router {
    function transferFrom(address, address, uint256) external returns (bool);
}
interface IWQMS is IERC20Router {
    function deposit() external payable;
    function withdraw(uint256) external;
    function transfer(address, uint256) external returns (bool);
}
interface IDexFactory { function getPair(address, address) external view returns (address); function createPair(address, address) external returns (address); }
interface IDexPair {
    function token0() external view returns (address);
    function reserve0() external view returns (uint256);
    function reserve1() external view returns (uint256);
    function mint(address) external returns (uint256);
    function burn(address) external returns (uint256, uint256);
    function swap(uint256, uint256, address) external;
    function transferFrom(address, address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}

contract DEXRouter {
    address public immutable factory;
    address public immutable WQMS;

    modifier ensure(uint256 deadline) { require(deadline >= block.timestamp, "Router: expired"); _; }

    constructor(address factory_, address wqms_) {
        require(factory_ != address(0) && wqms_ != address(0), "Router: zero address");
        factory = factory_;
        WQMS = wqms_;
    }

    receive() external payable { require(msg.sender == WQMS, "Router: unexpected QMS"); }

    function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external ensure(deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        (amountA, amountB) = _optimalAmounts(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin);
        address pair = _pair(tokenA, tokenB);
        _safeTransferFrom(tokenA, msg.sender, pair, amountA);
        _safeTransferFrom(tokenB, msg.sender, pair, amountB);
        liquidity = IDexPair(pair).mint(to);
    }

    function addLiquidityQMS(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountQMSMin, address to, uint256 deadline) external payable ensure(deadline) returns (uint256 amountToken, uint256 amountQMS, uint256 liquidity) {
        (amountToken, amountQMS) = _optimalAmounts(token, WQMS, amountTokenDesired, msg.value, amountTokenMin, amountQMSMin);
        address pair = _pair(token, WQMS);
        _safeTransferFrom(token, msg.sender, pair, amountToken);
        IWQMS(WQMS).deposit{value: amountQMS}();
        _safeTransfer(WQMS, pair, amountQMS);
        liquidity = IDexPair(pair).mint(to);
        if (msg.value > amountQMS) _safeTransferQMS(msg.sender, msg.value - amountQMS);
    }

    function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) public ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        address pair = _pair(tokenA, tokenB);
        require(IDexPair(pair).transferFrom(msg.sender, pair, liquidity), "Router: LP transfer failed");
        (uint256 amount0, uint256 amount1) = IDexPair(pair).burn(to);
        (amountA, amountB) = tokenA < tokenB ? (amount0, amount1) : (amount1, amount0);
        require(amountA >= amountAMin && amountB >= amountBMin, "Router: insufficient liquidity amount");
    }

    function removeLiquidityQMS(address token, uint256 liquidity, uint256 amountTokenMin, uint256 amountQMSMin, address to, uint256 deadline) external ensure(deadline) returns (uint256 amountToken, uint256 amountQMS) {
        (amountToken, amountQMS) = removeLiquidity(token, WQMS, liquidity, amountTokenMin, amountQMSMin, address(this), deadline);
        _safeTransfer(token, to, amountToken);
        IWQMS(WQMS).withdraw(amountQMS);
        _safeTransferQMS(to, amountQMS);
    }

    function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external ensure(deadline) returns (uint256[] memory amounts) {
        amounts = getAmountsOut(amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "Router: insufficient output");
        _safeTransferFrom(path[0], msg.sender, _pair(path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    function swapExactQMSForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable ensure(deadline) returns (uint256[] memory amounts) {
        require(path.length >= 2 && path[0] == WQMS, "Router: invalid QMS path");
        amounts = getAmountsOut(msg.value, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "Router: insufficient output");
        IWQMS(WQMS).deposit{value: msg.value}();
        _safeTransfer(WQMS, _pair(path[0], path[1]), msg.value);
        _swap(amounts, path, to);
    }

    function swapExactTokensForQMS(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external ensure(deadline) returns (uint256[] memory amounts) {
        require(path.length >= 2 && path[path.length - 1] == WQMS, "Router: invalid QMS path");
        amounts = getAmountsOut(amountIn, path);
        uint256 output = amounts[amounts.length - 1];
        require(output >= amountOutMin, "Router: insufficient output");
        _safeTransferFrom(path[0], msg.sender, _pair(path[0], path[1]), amountIn);
        _swap(amounts, path, address(this));
        IWQMS(WQMS).withdraw(output);
        payable(to).transfer(output);
    }

    function getAmountsOut(uint256 amountIn, address[] memory path) public view returns (uint256[] memory amounts) {
        require(path.length >= 2, "Router: invalid path");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i; i < path.length - 1; i++) {
            address pair = IDexFactory(factory).getPair(path[i], path[i + 1]);
            require(pair != address(0), "Router: pair missing");
            (uint256 reserveIn, uint256 reserveOut) = path[i] < path[i + 1]
                ? (IDexPair(pair).reserve0(), IDexPair(pair).reserve1())
                : (IDexPair(pair).reserve1(), IDexPair(pair).reserve0());
            require(reserveIn > 0 && reserveOut > 0, "Router: insufficient reserves");
            uint256 amountInWithFee = amounts[i] * 997;
            amounts[i + 1] = amountInWithFee * reserveOut / (reserveIn * 1000 + amountInWithFee);
        }
    }

    function _optimalAmounts(address a, address b, uint256 desiredA, uint256 desiredB, uint256 minA, uint256 minB) private view returns (uint256 amountA, uint256 amountB) {
        address pair = IDexFactory(factory).getPair(a, b);
        if (pair == address(0)) return (desiredA, desiredB);
        (uint256 reserveA, uint256 reserveB) = a < b
            ? (IDexPair(pair).reserve0(), IDexPair(pair).reserve1())
            : (IDexPair(pair).reserve1(), IDexPair(pair).reserve0());
        if (reserveA == 0 && reserveB == 0) return (desiredA, desiredB);
        uint256 optimalB = desiredA * reserveB / reserveA;
        if (optimalB <= desiredB) {
            require(desiredA >= minA && optimalB >= minB, "Router: insufficient optimal amount");
            return (desiredA, optimalB);
        }
        uint256 optimalA = desiredB * reserveA / reserveB;
        require(optimalA <= desiredA && optimalA >= minA && desiredB >= minB, "Router: insufficient optimal amount");
        return (optimalA, desiredB);
    }

    function _pair(address a, address b) private returns (address pair) {
        pair = IDexFactory(factory).getPair(a, b);
        if (pair == address(0)) pair = IDexFactory(factory).createPair(a, b);
    }

    function _swap(uint256[] memory amounts, address[] calldata path, address to) private {
        for (uint256 i; i < path.length - 1; i++) {
            address input = path[i];
            address output = path[i + 1];
            address pair = IDexFactory(factory).getPair(input, output);
            (uint256 amount0Out, uint256 amount1Out) = input < output
                ? (uint256(0), amounts[i + 1])
                : (amounts[i + 1], uint256(0));
            address recipient = i < path.length - 2 ? IDexFactory(factory).getPair(output, path[i + 2]) : to;
            IDexPair(pair).swap(amount0Out, amount1Out, recipient);
        }
    }

    function _safeTransferFrom(address token, address from, address to, uint256 value) private {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(IERC20Router.transferFrom.selector, from, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "Router: transferFrom failed");
    }

    function _safeTransfer(address token, address to, uint256 value) private {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(IWQMS.transfer.selector, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "Router: transfer failed");
    }

    function _safeTransferQMS(address to, uint256 amount) private {
        (bool success, ) = to.call{value: amount}("");
        require(success, "Router: QMS transfer failed");
    }
}
