pragma solidity ^0.7.6;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract TestTick {
    using SafeERC20 for IERC20;

    function swap(address swapPool, bool zeroForOne, uint256 _amountIn, address to, int24 targetTick) external returns (int256 amount0, int256 amount1) {
        //根据希望打到的tick计算sqrtPriceLimitX96
        uint160 sqrtPriceLimitX96 = TickMath.getSqrtRatioAtTick(targetTick);
        (amount0, amount1) = IUniswapV3Pool(swapPool).swap(to, zeroForOne, int256(_amountIn), sqrtPriceLimitX96, '');
    }

    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata
    ) external  {
        require(amount0Delta > 0 || amount1Delta > 0, 'Zero');
        IUniswapV3Pool pool = IUniswapV3Pool(msg.sender);
        if (amount0Delta > 0) {
            IERC20(pool.token0()).safeTransferFrom(tx.origin, msg.sender, uint256(amount0Delta));
        }
        if (amount1Delta > 0) {
            IERC20(pool.token1()).safeTransferFrom(tx.origin, msg.sender, uint256(amount1Delta));
        }
    }
}
