const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");

describe("single-Test", function() {
    const OPERATOR_ADDRESS = "0x757d2334731460d2181b6c64914ab4acfc22f31a";
    const VAULT_OWNER_ADDRESS = "0x72AA5E87A11815127dAff850E0586a07a9a0F5a4";

    const VAULT_ADDRESS = "0xa2d62728Cc10b256aBB1aA908A6559F85095BdEd";
    const POOL_ADDRESS = "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8";
    const ROUTER_ADDRESS = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
    const QUOTER_ADDRESS = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6";
    const DEV_ADDRESS = "0x757d2334731460d2181b6c64914ab4acfc22f31a";

    const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

    const WETH_ACCOUNT_ADDRESS = "0x2f0b23f53734252bda2277357e97e1517d6b042a";
    const USDC_ACCOUNT_ADDRESS = "0x0A59649758aa4d66E25f08Dd01271e891fe52199";
    const SUN_ADDRESS = "0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296";


    //set fork
    let ten = hre.tenderly.network();
    ten.setHead("962a22f3-299e-4fc2-b37c-b625e0d374c4");
    let provider = new ethers.providers.Web3Provider(ten);
    ethers.provider = provider;

    let interestModel, oracle, config, lendVault, singleVault, vault;
    let weth, usdc, vaultOwner;
    let wethAccount, usdcAccount, sunAccount;
    let positionId0, positionId1;
    it("1、deploy InterestModel", async function() {
        const InterestModel = await hre.ethers.getContractFactory("InterestModel");
        interestModel = await InterestModel.deploy();
        await interestModel.deployed();
        console.log("interestModel deploy: ", interestModel.address);
        await ten.verify({
             name: "InterestModel",
             address: interestModel.address
        });
    });

    it("2、deploy UniV3PriceOracle", async function() {
        const UniV3PriceOracle = await hre.ethers.getContractFactory("UniV3PriceOracle");
        oracle = await UniV3PriceOracle.deploy();
        await oracle.deployed();
        console.log("oracle deploy: ", oracle.address);
        await ten.verify({
             name: "UniV3PriceOracle",
             address: oracle.address
        });
    });

    it("3、deploy ProjectConfig", async function() {
        const ProjectConfig = await hre.ethers.getContractFactory("ProjectConfig");
        //利率、清算负债率、闪电贷利率、利率模型地址、预言机地址
        config = await ProjectConfig.deploy(3000, 9000, 20, interestModel.address, oracle.address);
        await config.deployed();
        console.log("config deploy: ", config.address);
        await ten.verify({
            name: "ProjectConfig",
            address: config.address
        });
    });

    it("4、deploy LendVault", async function() {
        const LendVault = await hre.ethers.getContractFactory("LendVault");
        lendVault = await LendVault.deploy(config.address);
        await lendVault.deployed();
        console.log("lendVault deploy: ", lendVault.address);
        await ten.verify({
            name: "LendVault",
            address: lendVault.address
        });
    });

    it("5、deploy LeverageSingleVault", async function() {
        const LeverageSingleVault = await hre.ethers.getContractFactory("LeverageSingleVault");
        //address _lendVault, address _router, address _quoterAddress, address _config, address _dev
        singleVault = await LeverageSingleVault.deploy(lendVault.address, ROUTER_ADDRESS, QUOTER_ADDRESS, config.address, DEV_ADDRESS);
        await singleVault.deployed();
        console.log("LeverageSingleVault deploy: ", singleVault.address);
        await ten.verify({
           name: "LeverageSingleVault",
           address: singleVault.address
        });
    });

    it("6 add bank", async function() {
        await lendVault.addBank(WETH_ADDRESS, 1, "iWETH", "iWETH");
        await lendVault.addBank(USDC_ADDRESS, 2, "iUSDC", "iUSDC");
    });

    it("7、add debtor", async function() {
        await lendVault.setDebtor(singleVault.address, true);
    });

    it("8、add pool", async function() {
        await singleVault.addPool(500, true,  VAULT_ADDRESS, 8500, 9000);
        await singleVault.addPool(500, false, VAULT_ADDRESS, 8500, 9000);
    });

    it("9、get contract", async function() {
        weth = await ethers.getContractAt("IBToken", WETH_ADDRESS);
        usdc = await ethers.getContractAt("IBToken", USDC_ADDRESS);
        vault = await ethers.getContractAt("IUniverseVault", VAULT_ADDRESS);
    });

    it("10、fetch account", async function() {
        operator = await ethers.provider.getSigner(OPERATOR_ADDRESS);
        wethAccount = await ethers.provider.getSigner(WETH_ACCOUNT_ADDRESS);
        usdcAccount = await ethers.provider.getSigner(USDC_ACCOUNT_ADDRESS);
        sunAccount = await ethers.provider.getSigner(SUN_ADDRESS);
        vaultOwner = await ethers.provider.getSigner(VAULT_OWNER_ADDRESS);
    });

    it("11、transfer token", async function() {
        await sunAccount.sendTransaction({
            to: OPERATOR_ADDRESS,
            value: ethers.utils.parseEther("100.0")
        });
        await weth.connect(wethAccount).transfer(OPERATOR_ADDRESS, ethers.utils.parseEther("100000.0"));
        await usdc.connect(usdcAccount).transfer(OPERATOR_ADDRESS, ethers.utils.parseUnits("10000000.0", 6));
    });

    it("12、lend deposit", async function() {
        await weth.connect(operator).approve(lendVault.address, ethers.utils.parseEther("1000000000000.0"));
        await usdc.connect(operator).approve(lendVault.address, ethers.utils.parseEther("1000000000000.0"));
        await lendVault.connect(operator).deposit(WETH_ADDRESS, ethers.utils.parseEther("5000.0"));
        await lendVault.connect(operator).deposit(USDC_ADDRESS, ethers.utils.parseUnits("5000000.0", 6));
    });

    it("13、open position", async function() {
            let token0Amount = ethers.utils.parseUnits("10000", 6);
            let token0Debt = ethers.utils.parseUnits("10000", 6);
            await weth.connect(operator).approve(singleVault.address, ethers.utils.parseEther("1000000000000.0"));
            await usdc.connect(operator).approve(singleVault.address, ethers.utils.parseEther("1000000000000.0"));
            //vault 添加白名单
            await vault.connect(vaultOwner).updateWhiteList(singleVault.address, true);
            await singleVault.connect(operator).openPosition(0, VAULT_ADDRESS, token0Amount,token0Debt);
            positionId0 = 1;
    });

    it("13、open position weth", async function() {
            let token1Amount = ethers.utils.parseEther("3");
            let token1Debt = ethers.utils.parseEther("3");
            await singleVault.connect(operator).openPosition(1, VAULT_ADDRESS, token1Amount, token1Debt);
            positionId1 = 1;
    });

    it("14、cover position", async function() {
            let token0Amount = ethers.utils.parseUnits("10000", 6);
            let token1Amount = ethers.utils.parseEther("3");
            await singleVault.connect(operator).coverPosition(positionId0, token0Amount);
            await singleVault.connect(operator).coverPosition(positionId1, token1Amount);
    });

    it("15、close position", async function() {
            await singleVault.connect(operator).closePosition(positionId0);
            await singleVault.connect(operator).closePosition(positionId1);
    });

});


function sleep (time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}


function getRandomInt(max) {
  return Math.floor(Math.random() * max + 1);
}
