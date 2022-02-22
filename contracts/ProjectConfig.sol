// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "../interfaces/IPriceOracle.sol";
import "../interfaces/IProjectConfig.sol";
import "../interfaces/IInterestModel.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract ProjectConfig is IProjectConfig, Ownable {
    using SafeMath for uint256;

    uint256 public override interestBps; // 2000  /   10000
    uint256 public override liquidateBps; // 500  /   10000
    uint256 public override flashBps; // 20 / 10000

    IInterestModel public interestModel;

    IPriceOracle private oracle;

    address public override hunter;
    bool public override onlyHunter = true;

    constructor(
        uint256 _interestBps,
        uint256 _liquidateBps,
        uint256 _flashBps,
        address _interestModel,
        address _oracle,
        address _hunter
    ) {
        interestBps = _interestBps;
        liquidateBps = _liquidateBps;
        flashBps = _flashBps;
        interestModel = IInterestModel(_interestModel);
        oracle = IPriceOracle(_oracle);
        hunter = _hunter;
    }

    function setParams(
        uint256 _interestBps,
        uint256 _liquidateBps,
        uint256 _flashBps,
        address _interestModel
    ) external onlyOwner {
        interestBps = _interestBps;
        liquidateBps = _liquidateBps;
        flashBps = _flashBps;
        interestModel = IInterestModel(_interestModel);
    }

    function changeOracle(
        address newOracle
    ) external onlyOwner {
        require(newOracle != address(0));
        oracle = IPriceOracle(newOracle);
    }

    function setHunter( address _hunter) external onlyOwner {
        require(_hunter != address(0));
        hunter = _hunter;
    }

    function setOnlyHunter(
        bool _onlyHunter
    ) external onlyOwner {
        onlyHunter = _onlyHunter;
    }

    /// 计算利率 系数: 1E18
    /// utilization: 资金使用率
    /// tier: 利率等级
    function interestRate(uint256 utilization, uint8 tier) external override view returns (uint256) {
        if (tier == 0) {
            return interestModel.highInterestRate(utilization);
        } else if (tier == 1) {
            return interestModel.mediumInterestRate(utilization);
        } else {
            return interestModel.lowInterestRate(utilization);
        }
    }

    function getOracle() external override view returns (address){
        return address(oracle);
    }

}
