pragma solidity ^0.7.6;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

contract Test {

    function swap(address swapPool, uint256 _amountIn, address to, int256 targetTick) internal {
        //根据希望打到的tick计算sqrtPriceLimitX96
        uint160 sqrtPriceLimitX96 = TickMath.getSqrtRatioAtTick(targetTick);
        IUniswapV3Pool(swapPool).swap(to, true, int256(_amountIn), sqrtPriceLimitX96, '');
    }

}
