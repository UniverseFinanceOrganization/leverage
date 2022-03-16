// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "../interfaces/IPriceOracle.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import "@uniswap/v3-core/contracts/libraries/FixedPoint96.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

contract UniV3PriceOracle is Ownable, IPriceOracle {
    using SafeMath for uint256;

    function getPrice(address pool, uint8 second, uint8 num)
        external view override
        returns (uint256 price)
    {
        require(second > 0 && second <= 3600, "wrong secondsAgo");
        uint32[] memory secondsAgos = new uint32[](num + 1);
        for (uint8 i = 0; i <= num; i++) {
            secondsAgos[i] = second * (num - i);
        }
        (int56[] memory tickCumulatives, ) = IUniswapV3Pool(pool).observe(secondsAgos);
        int56 tick;
        uint160 sqrtRatio;
        uint256 priceQ96;
        for (uint8 i = 0; i < num; i++) {
            tick = (tickCumulatives[num] - tickCumulatives[i]) / (second * (num - i));
            assert(tick <= type(int24).max && tick >= type(int24).min);
            sqrtRatio = TickMath.getSqrtRatioAtTick(int24(tick));
            priceQ96 = priceQ96.add(FullMath.mulDiv(sqrtRatio, sqrtRatio, FixedPoint96.Q96));
        }
        return priceQ96.div(num);
    }
}
