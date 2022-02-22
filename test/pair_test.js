const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");

describe("Pair-Test", function() {
    const OPERATOR_ADDRESS = "0x757d2334731460d2181b6c64914ab4acfc22f31a";
    const VAULT_OWNER_ADDRESS = "0x72AA5E87A11815127dAff850E0586a07a9a0F5a4";

    const VAULT_ADDRESS = "0xbc044Ab5a8BFa595CBCEf0abD8620b555d271E6F";
    const POOL_ADDRESS = "0x4b5ab61593a2401b1075b90c04cbcdd3f87ce011";
    const ROUTER_ADDRESS = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
    const QUOTER_ADDRESS = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";
    const DEV_ADDRESS = "0x757d2334731460d2181b6c64914ab4acfc22f31a";

    const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const LOOKS_ADDRESS = "0xf4d2888d29D722226FafA5d9B24F9164c092421E";

    const WETH_ACCOUNT_ADDRESS = "0x2f0b23f53734252bda2277357e97e1517d6b042a";
    const LOOKS_ACCOUNT_ADDRESS = "0x465a790b428268196865a3ae2648481ad7e0d3b1";
    const SUN_ADDRESS = "0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296";

    //set fork
    let ten = hre.tenderly.network();
    ten.setHead("962a22f3-299e-4fc2-b37c-b625e0d374c4");
    let provider = new ethers.providers.Web3Provider(ten);
    ethers.provider = provider;

    let interestModel, oracle, config, lendVault, pairVault, vault, test;
    let weth, looks, vaultOwner;
    let wethAccount, looksAccount, sunAccount;
    let positionId;

    it("0、deploy testTick", async function() {
        const TestTick = await hre.ethers.getContractFactory("TestTick");
        testTick = await TestTick.deploy();
        await testTick.deployed();
        console.log("testTick deploy: ", testTick.address);
        await ten.verify({
             name: "TestTick",
             address: testTick.address
        });
    });

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
        config = await ProjectConfig.deploy(3000, 9000, 20, interestModel.address, oracle.address, OPERATOR_ADDRESS);
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

    it("5、deploy LeveragePairVault", async function() {
        const LeveragePairVault = await hre.ethers.getContractFactory("LeveragePairVault");
        //address _lendVault, address _router, address _quoterAddress, address _config, address _dev
        pairVault = await LeveragePairVault.deploy(lendVault.address, ROUTER_ADDRESS, QUOTER_ADDRESS, config.address, DEV_ADDRESS);
        await pairVault.deployed();
        console.log("LeveragePairVault deploy: ", pairVault.address);
        await ten.verify({
           name: "LeveragePairVault",
           address: pairVault.address
        });
    });

    it("6 add bank", async function() {
        await lendVault.addBank(WETH_ADDRESS, 1, "iWETH", "iWETH");
        await lendVault.addBank(LOOKS_ADDRESS, 2, "iLOOKS", "iLOOKS");
    });

    it("7、add debtor", async function() {
        await lendVault.setDebtor(pairVault.address, true);
    });

    it("8、add pool", async function() {
        await pairVault.addPool(500, VAULT_ADDRESS, 8500, 9000);
    });

    it("9、get contract", async function() {
        weth = await ethers.getContractAt("IBToken", WETH_ADDRESS);
        looks = await ethers.getContractAt("IBToken", LOOKS_ADDRESS);

        vault = await ethers.getContractAt("IUniversePairVault", VAULT_ADDRESS);
    });

    it("10、fetch account", async function() {
        operator = await ethers.provider.getSigner(OPERATOR_ADDRESS);
        wethAccount = await ethers.provider.getSigner(WETH_ACCOUNT_ADDRESS);
        looksAccount = await ethers.provider.getSigner(LOOKS_ACCOUNT_ADDRESS);
        sunAccount = await ethers.provider.getSigner(SUN_ADDRESS);
        vaultOwner = await ethers.provider.getSigner(VAULT_OWNER_ADDRESS);
    });

    it("11、transfer token", async function() {
        await sunAccount.sendTransaction({
            to: OPERATOR_ADDRESS,
            value: ethers.utils.parseEther("100.0")
        });
        await weth.connect(wethAccount).transfer(OPERATOR_ADDRESS, ethers.utils.parseEther("100000.0"));
        await looks.connect(looksAccount).transfer(OPERATOR_ADDRESS, ethers.utils.parseUnits("100000000.0", 18));
    });

    it("12、lend deposit", async function() {
        await weth.connect(operator).approve(lendVault.address, ethers.utils.parseEther("1000000000000.0"));
        await looks.connect(operator).approve(lendVault.address, ethers.utils.parseEther("1000000000000.0"));
        await lendVault.connect(operator).deposit(WETH_ADDRESS, ethers.utils.parseEther("5000.0"));
        await lendVault.connect(operator).deposit(LOOKS_ADDRESS, ethers.utils.parseUnits("500000.0", 18));
    });

    it("13、open position", async function() {
            let token0Amount = ethers.utils.parseEther("10");
            let token1Amount = ethers.utils.parseEther("15000");
            let token0Debt = ethers.utils.parseEther("10");
            let token1Debt = ethers.utils.parseEther("15000");
            await weth.connect(operator).approve(pairVault.address, ethers.utils.parseEther("1000000000000.0"));
            await looks.connect(operator).approve(pairVault.address, ethers.utils.parseEther("1000000000000.0"));
            //vault 添加白名单
            await vault.connect(vaultOwner).updateWhiteList(pairVault.address, true);
            await pairVault.connect(operator).openPosition(VAULT_ADDRESS, token0Amount, token1Amount, token0Debt, token1Debt);
            positionId = 1;
    });

    it("13-0、close position pre", async function() {
            let r = await pairVault.connect(operator).closePositionPre(positionId);
            console.log("关仓预览：", r);
    });

    //closePositionPre

    it("13-1、calc health", async function() {
           let health = await pairVault.posHealth(positionId);
           console.log("仓位：" + positionId + "的负债率是：", health);
    });

    it("13-3、chang price up 50%", async function() {
           let uniswapV3Pool = await ethers.getContractAt("IUniswapV3Pool", POOL_ADDRESS);
           let slot0 = await uniswapV3Pool.slot0();
           let currentTick = slot0[1];
           console.log("current tick:", currentTick);
           //价格变化50%，tick + 4055   价格反7倍 tick + 20000
           let targetTick = currentTick - 12000;
           console.log("targetTick tick:", targetTick);

           let _amountIn = ethers.utils.parseEther("50000000.0");

           await looks.connect(operator).transfer(testTick.address, _amountIn);

           await testTick.connect(operator).swap(POOL_ADDRESS, false, _amountIn, OPERATOR_ADDRESS, targetTick);

           slot0 = await uniswapV3Pool.slot0();
           currentTick = slot0[1];
           console.log("current tick:", currentTick);

           let health = await pairVault.posHealth(positionId);
           console.log("仓位：" + positionId + "的负债率是：", health);
    });

    it("13-5、close position pre", async function() {
            let r = await pairVault.connect(operator).closePositionPre(positionId);
            console.log("关仓预览：", r);
    });

    it.skip("14、cover position", async function() {
            let token0Amount = ethers.utils.parseEther("10");
            let token1Amount = ethers.utils.parseEther("15000");
            await pairVault.connect(operator).coverPosition(positionId, token0Amount, token1Amount);
    });

    it("15、close position", async function() {
            await pairVault.connect(operator).closePosition(positionId);
    });

    it("16、liquidate position", async function() {
            await pairVault.connect(operator).liquidate(positionId);
    });





});


function sleep (time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}


function getRandomInt(max) {
  return Math.floor(Math.random() * max + 1);
}
