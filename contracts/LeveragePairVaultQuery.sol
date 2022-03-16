// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

pragma abicoder v2;

import "./LeveragePairVault.sol";
import "../interfaces/ILendVault.sol";
import "../interfaces/IProjectConfig.sol";
import "../interfaces/IPriceOracle.sol";
import "../interfaces/IUniversePairVault.sol";

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@uniswap/v3-periphery/contracts/interfaces/IQuoterV2.sol";
import "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@uniswap/v3-core/contracts/libraries/FixedPoint96.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

contract LeveragePairVaultQuery {

    using SafeERC20 for IERC20;
    using SafeERC20 for IUniversePairVault;
    using SafeMath for uint256;

    LeveragePairVault public immutable pairVault;
    ILendVault public immutable lendVault;

    constructor(address _pairVault, address _lendVault) {
        pairVault = LeveragePairVault(_pairVault);
        lendVault = ILendVault(_lendVault);
    }

    // get position info
    function _positions(uint256 positionId) internal view returns(LeveragePairVault.Position memory position){
        (address owner, address vaultAddress, uint256 debtShare0, uint256 debtShare1, uint256 share) = pairVault.positions(positionId);
        position.owner = owner;
        position.vaultAddress = vaultAddress;
        position.debtShare0 = debtShare0;
        position.debtShare1 = debtShare1;
        position.share = share;
    }

    function _pools(address _vaultAddress) internal view returns(LeveragePairVault.PoolInfo memory poolInfo){
        (bool isOpen,bool canFarm,address token0,address token1,IUniversePairVault vault,IERC20 shareToken,
        uint64  maxPriceDiff,uint256 share,uint256 openFactor,uint256 liquidateFactor,uint256 idx) = pairVault.pools(_vaultAddress);
        poolInfo.isOpen = isOpen;
        poolInfo.canFarm = canFarm;
        poolInfo.token0 = token0;
        poolInfo.token1 = token1;
        poolInfo.vault = vault;
        poolInfo.shareToken = shareToken;
        poolInfo.maxPriceDiff = maxPriceDiff;
        poolInfo.share = share;
        poolInfo.openFactor = openFactor;
        poolInfo.liquidateFactor = liquidateFactor;
        poolInfo.idx = idx;

    }

    function closePositionPre(uint256 positionId) external view returns(uint256 bal0, uint256 bal1){
        // Check Owner Address
        LeveragePairVault.Position memory position = _positions(positionId);
        if(position.share == 0){
            return (0,0);
        }

        LeveragePairVault.PoolInfo memory pool = _pools(position.vaultAddress);

        (bal0, bal1) = pool.vault.getBals(position.share);

        uint256 debt0 = lendVault.debtShareToBalance(pool.token0, position.debtShare0);
        uint256 debt1 = lendVault.debtShareToBalance(pool.token1, position.debtShare1);

        //
        if(bal0 >= debt0){
            bal0 = bal0.sub(debt0);
            debt0 = 0;
        }else{
            bal0 = 0;
            debt0 = debt0.sub(bal0);
        }
        if(bal1 >= debt1){
            bal1 = bal1.sub(debt1);
            debt1 = 0;
        }else{
            bal1 = 0;
            debt1 = debt1.sub(bal1);
        }
        //
        if(debt0 == 0 && debt1 == 0){
            return (bal0, bal1);
        }
        //
        if(debt0 > 0 && debt1 > 0){
            return (bal0, bal1);
        }
        (,address poolAddress,,,,,) = pool.vault.positionList(0);
        (,int24 tick,,,,,) = IUniswapV3Pool(poolAddress).slot0();
        uint160 sqrtPriceX96 = TickMath.getSqrtRatioAtTick(tick);

        //
        if(debt0 == 0 && debt1 > 0 && bal0 > 0){
            uint256 needBal0 = FullMath.mulDiv(debt1, FixedPoint96.Q96, sqrtPriceX96);
            needBal0 = FullMath.mulDiv(needBal0, FixedPoint96.Q96, sqrtPriceX96);
            if(bal0 >= needBal0){
                bal0 = bal0.sub(needBal0);
            }else{
                bal0 = 0;
            }
        }
        //
        if(debt1 == 0 && debt0 > 0 && bal1 > 0){
            uint256 needBal1 = FullMath.mulDiv(debt0, sqrtPriceX96, FixedPoint96.Q96);
            needBal1 = FullMath.mulDiv(needBal1, sqrtPriceX96, FixedPoint96.Q96);
            if(bal1 >= needBal1){
                bal1 = bal1.sub(needBal1);
            }else{
                bal1 = 0;
            }
        }
    }


}
