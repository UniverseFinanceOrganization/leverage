const hre = require("hardhat");
const ethers = hre.ethers;
const util = ethers.utils;
const {expect} = require("chai");

const UNI_V3_SWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const UNI_V3_QUOTER_ADDRESS = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6";
const UNI_V2_SWAP_ROUTER = "0xDC00bA87Cc2D99468f7f34BC04CBf72E111A32f7";
const UNIVERSE_POOL_USDC_WETH = "0xa2d62728Cc10b256aBB1aA908A6559F85095BdEd";
const UNIVERSE_POOL_WETH_LOOKS = "0xbc044Ab5a8BFa595CBCEf0abD8620b555d271E6F"
const USER_UNIVERSE_VAULT_OWNER = "0x72aa5e87a11815127daff850e0586a07a9a0f5a4";

const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const USDC_ADDRESS = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDT_ADDRESS = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const WBTC_ADDRESS = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
const LOOKS_ADDRESS = "0xf4d2888d29D722226FafA5d9B24F9164c092421E";

const USER_WETH_OWNER = "0x2f0b23f53734252bda2277357e97e1517d6b042a";
const USER_USDC_OWNER = "0x0a59649758aa4d66e25f08dd01271e891fe52199";
const USER_USDT_OWNER = "0xf977814e90da44bfa03b6295a0616a897441acec";
const USER_WBTC_OWNER = "0xbf72da2bd84c5170618fbe5914b0eca9638d5eb5";


const USER_OWNER = "0x959290f09c9c75ab845fdb9d20ca3efdac229c5b";
const USER_USER1 = "0x08230c1628cc6fe1bbe005e03f10ae96c244778a";
const USER_USER2 = "0xa961cd7aac1a703de7a7bc970541e54db4fb453c";
const USER_SWAPPER = "0x72d2be90fcd6b454948db72e8a681979e36815af";

const PROJECT_CONFIG_ADDRESS = "0x59e61A518ae41BF8DDdb2149FE6E2e5DC72012b6";
const LEND_VAULT_ADDRESS = "0xd56B3FBE8ACE81025c3aDCf2194811dcCbA26e53";
const LEVERAGE_PAIR_VAULT_ADDRESS = "0xeC7ca8B77e3305a37B42564EfA5a203f44BEd06F";
const LEVERAGE_SINGLE_VAULT_ADDRESS = "0xaB703023A53c0840B517367aA365DD6CccDA4B94";


describe("Single-Test", function () {

    let ten = hre.tenderly.network();
    ten.setHead("fc21c931-4b34-4a9f-a84f-095b3dbe20ec");
    ethers.provider = new ethers.providers.Web3Provider(ten);

    let envHead;

    let interestModel, oracle, config, lendVault, singleVault, pairVault, vault;
    let weth, usdc, usdt, wbtc;
    let owner, user1, user2, swapper;
    let positionId;

    it("-2 init user and load exist contract", async function () {
        // 账号初始化
        owner = await ethers.provider.getSigner(USER_OWNER);
        user1 = await ethers.provider.getSigner(USER_USER1);
        user2 = await ethers.provider.getSigner(USER_USER2);
        swapper = await ethers.provider.getSigner(USER_SWAPPER);
        console.log("init user success");

        // 加载资产合约
        weth = await ethers.getContractAt("IBToken", WETH_ADDRESS);
        usdc = await ethers.getContractAt("IBToken", USDC_ADDRESS);
        usdt = await ethers.getContractAt("IBToken", USDT_ADDRESS);
        wbtc = await ethers.getContractAt("IBToken", WBTC_ADDRESS);


        // 常用账号充值（eth）
        await setBalance(USER_OWNER, 1000 * 1e18);
        await setBalance(USER_USER1, 10000 * 1e18);
        await setBalance(USER_USER2, 10000 * 1e18);
        await setBalance(USER_SWAPPER, 10000 * 1e18);
        console.log("set balance eth success");


    });

    it.skip("-1 deploy contract", async function () {

        // 部署合约
        const InterestModel = await hre.ethers.getContractFactory("InterestModel");
        interestModel = await InterestModel.connect(owner).deploy();
        await interestModel.deployed();
        console.log("interestModel deploy: ", interestModel.address);
        await ten.verify({
            name: "InterestModel",
            address: interestModel.address
        });

        const UniV3PriceOracle = await hre.ethers.getContractFactory("UniV3PriceOracle");
        oracle = await UniV3PriceOracle.connect(owner).deploy();
        await oracle.deployed();
        console.log("oracle deploy: ", oracle.address);
        await ten.verify({
            name: "UniV3PriceOracle",
            address: oracle.address
        });

        const ProjectConfig = await hre.ethers.getContractFactory("ProjectConfig");
        //利率、清算负债率、闪电贷利率、利率模型地址、预言机地址
        config = await ProjectConfig.connect(owner).deploy(3000, 9000, 20, interestModel.address, oracle.address);
        await config.deployed();
        console.log("config deploy: ", config.address);
        await ten.verify({
            name: "ProjectConfig",
            address: config.address
        });

        const LendVault = await hre.ethers.getContractFactory("LendVault");
        lendVault = await LendVault.connect(owner).deploy(config.address);
        await lendVault.deployed();
        console.log("lendVault deploy: ", lendVault.address);
        await ten.verify({
            name: "LendVault",
            address: lendVault.address
        });

        const LeveragePairVault = await hre.ethers.getContractFactory("LeveragePairVault");
        //address _lendVault, address _router, address _quoterAddress, address _config, address _dev
        pairVault = await LeveragePairVault.connect(owner).deploy(lendVault.address, UNI_V3_SWAP_ROUTER, UNI_V3_QUOTER_ADDRESS, config.address, USER_OWNER);
        await pairVault.deployed();
        console.log("LeveragePairVault deploy: ", pairVault.address);
        await ten.verify({
            name: "LeveragePairVault",
            address: pairVault.address
        });

        const LeverageSingleVault = await hre.ethers.getContractFactory("LeverageSingleVault");
        //address _lendVault, address _router, address _quoterAddress, address _config, address _dev
        singleVault = await LeverageSingleVault.connect(owner).deploy(lendVault.address, UNI_V3_SWAP_ROUTER, UNI_V3_QUOTER_ADDRESS, config.address, USER_OWNER);
        await singleVault.deployed();
        console.log("LeverageSingleVault deploy: ", singleVault.address);
        await ten.verify({
            name: "LeverageSingleVault",
            address: singleVault.address
        });

        // 借贷金库增加资产
        await lendVault.connect(owner).addBank(WETH_ADDRESS, 1, "iWETH", "iWETH");
        await lendVault.connect(owner).addBank(USDC_ADDRESS, 1, "iUSDC", "iUSDC");
        await lendVault.connect(owner).addBank(LOOKS_ADDRESS, 2, "iLOOKS", "iLOOKS");

        await lendVault.connect(owner).setDebtor(singleVault.address, true);
        await lendVault.connect(owner).setDebtor(pairVault.address, true);

        // 杠杆双币金库增加借贷挖矿池
        await pairVault.addPool(100, UNIVERSE_POOL_WETH_LOOKS, 6000, 9000);

        // 杠杆单币金库增加借贷挖矿池
        // 最大价差/10000，是否池子token0，池子地址，开仓借贷占比/10000，强平借贷占比/10000
        await singleVault.connect(owner).addPool(100, true, UNIVERSE_POOL_USDC_WETH, 6000, 9000);
        await singleVault.connect(owner).addPool(100, false, UNIVERSE_POOL_USDC_WETH, 6000, 9000)
        console.log("singleVault add pool success");

        envHead = ten.getHead();
        console.log("env head :" + envHead);
    });

    it.skip("0、deploy contract and prepare account", async function () {
        // 部署合约
        const InterestModel = await hre.ethers.getContractFactory("InterestModel");
        interestModel = await InterestModel.connect(owner).deploy();
        await interestModel.deployed();
        console.log("interestModel deploy: ", interestModel.address);
        await ten.verify({
            name: "InterestModel",
            address: interestModel.address
        });

        const UniV3PriceOracle = await hre.ethers.getContractFactory("UniV3PriceOracle");
        oracle = await UniV3PriceOracle.connect(owner).deploy();
        await oracle.deployed();
        console.log("oracle deploy: ", oracle.address);
        await ten.verify({
            name: "UniV3PriceOracle",
            address: oracle.address
        });

        const ProjectConfig = await hre.ethers.getContractFactory("ProjectConfig");
        //利率、清算负债率、闪电贷利率、利率模型地址、预言机地址
        config = await ProjectConfig.connect(owner).deploy(3000, 9000, 20, interestModel.address, oracle.address);
        await config.deployed();
        console.log("config deploy: ", config.address);
        await ten.verify({
            name: "ProjectConfig",
            address: config.address
        });

        const LendVault = await hre.ethers.getContractFactory("LendVault");
        lendVault = await LendVault.connect(owner).deploy(config.address);
        await lendVault.deployed();
        console.log("lendVault deploy: ", lendVault.address);
        await ten.verify({
            name: "LendVault",
            address: lendVault.address
        });

        const LeverageSingleVault = await hre.ethers.getContractFactory("LeverageSingleVault");
        //address _lendVault, address _router, address _quoterAddress, address _config, address _dev
        singleVault = await LeverageSingleVault.connect(owner).deploy(lendVault.address, UNI_V3_SWAP_ROUTER, UNI_V3_QUOTER_ADDRESS, config.address, USER_OWNER);
        await singleVault.deployed();
        console.log("LeverageSingleVault deploy: ", singleVault.address);
        await ten.verify({
            name: "LeverageSingleVault",
            address: singleVault.address
        });

        const LeveragePairVault = await hre.ethers.getContractFactory("LeveragePairVault");
        //address _lendVault, address _router, address _quoterAddress, address _config, address _dev
        pairVault = await LeveragePairVault.connect(owner).deploy(lendVault.address, UNI_V3_SWAP_ROUTER, UNI_V3_QUOTER_ADDRESS, config.address, USER_OWNER);
        await pairVault.deployed();
        console.log("LeveragePairVault deploy: ", pairVault.address);
        await ten.verify({
            name: "LeveragePairVault",
            address: pairVault.address
        });


        // 常用账号充值（eth）
        await setBalance(USER_OWNER, 1000 * 1e18);
        await setBalance(USER_USER1, 10000 * 1e18);
        await setBalance(USER_USER2, 10000 * 1e18);
        await setBalance(USER_SWAPPER, 10000 * 1e18);
        console.log("set balance eth success");

        // 大户转账
        let wethAccount = await ethers.provider.getSigner(USER_WETH_OWNER);
        await weth.connect(wethAccount).transfer(USER_USER1, ethers.utils.parseEther("1000"));
        await weth.connect(wethAccount).transfer(USER_USER2, ethers.utils.parseEther("1000"));
        await weth.connect(wethAccount).transfer(USER_SWAPPER, ethers.utils.parseEther("10000"));
        console.log("set balance weth success");

        let usdcAccount = await ethers.provider.getSigner(USER_USDC_OWNER);
        await usdc.connect(usdcAccount).transfer(USER_USER1, ethers.utils.parseUnits("10000", 6));
        await usdc.connect(usdcAccount).transfer(USER_USER2, ethers.utils.parseUnits("10000", 6));
        await usdc.connect(usdcAccount).transfer(USER_SWAPPER, ethers.utils.parseUnits("100000", 6));
        console.log("set balance usdc success");

        let usdtAccount = await ethers.provider.getSigner(USER_USDT_OWNER);
        await usdt.connect(usdtAccount).transfer(USER_USER1, ethers.utils.parseUnits("10000", 6));
        await usdt.connect(usdtAccount).transfer(USER_USER2, ethers.utils.parseUnits("10000", 6));
        await usdt.connect(usdtAccount).transfer(USER_SWAPPER, ethers.utils.parseUnits("100000", 6));
        console.log("set balance usdt success");

        let wbtcAccount = await ethers.provider.getSigner(USER_WBTC_OWNER);
        await wbtc.connect(wbtcAccount).transfer(USER_USER1, ethers.utils.parseUnits("100", 8));
        await wbtc.connect(wbtcAccount).transfer(USER_USER2, ethers.utils.parseUnits("100", 8));
        await wbtc.connect(wbtcAccount).transfer(USER_SWAPPER, ethers.utils.parseUnits("1000", 8));

        console.log("set balance wbtc success");

        await weth.connect(user1).approve(lendVault.address, weth.balanceOf(USER_USER1));
        await weth.connect(user2).approve(lendVault.address, weth.balanceOf(USER_USER2));
        await weth.connect(swapper).approve(lendVault.address, weth.balanceOf(USER_SWAPPER));

        await usdc.connect(user1).approve(lendVault.address, usdc.balanceOf(USER_USER1));
        await usdc.connect(user2).approve(lendVault.address, usdc.balanceOf(USER_USER2));
        await usdc.connect(swapper).approve(lendVault.address, usdc.balanceOf(USER_SWAPPER));

        await usdt.connect(user1).approve(lendVault.address, usdt.balanceOf(USER_USER1));
        await usdt.connect(user2).approve(lendVault.address, usdt.balanceOf(USER_USER2));
        await usdt.connect(swapper).approve(lendVault.address, usdt.balanceOf(USER_SWAPPER));

        console.log("approve for lendVault success");

        await weth.connect(user1).approve(singleVault.address, weth.balanceOf(USER_USER1));
        await weth.connect(user2).approve(singleVault.address, weth.balanceOf(USER_USER2));
        await weth.connect(swapper).approve(singleVault.address, weth.balanceOf(USER_SWAPPER));

        await usdc.connect(user1).approve(singleVault.address, usdc.balanceOf(USER_USER1));
        await usdc.connect(user2).approve(singleVault.address, usdc.balanceOf(USER_USER2));
        await usdc.connect(swapper).approve(singleVault.address, usdc.balanceOf(USER_SWAPPER));

        await usdt.connect(user1).approve(singleVault.address, usdt.balanceOf(USER_USER1));
        await usdt.connect(user2).approve(singleVault.address, usdt.balanceOf(USER_USER2));
        await usdt.connect(swapper).approve(singleVault.address, usdt.balanceOf(USER_SWAPPER));

        console.log("approve for singleVault success");

        // 借贷金库增加资产
        await lendVault.connect(owner).addBank(WETH_ADDRESS, 1, "iWETH", "iWETH");
        await lendVault.connect(owner).addBank(USDC_ADDRESS, 1, "iUSDC", "iUSDC");
        await lendVault.connect(owner).addBank(LOOKS_ADDRESS, 2, "iLOOKS", "iLOOKS");


        await lendVault.connect(owner).setDebtor(singleVault.address, true);
        await lendVault.connect(owner).setDebtor(pairVault.address, true);


        console.log("lendVault add bank success");

        // 杠杆双币金库增加借贷挖矿池
        await pairVault.addPool(100, UNIVERSE_POOL_WETH_LOOKS, 6000, 9000);

        // 杠杆单币金库增加借贷挖矿池
        // 最大价差/10000，是否池子token0，池子地址，开仓借贷占比/10000，强平借贷占比/10000
        await singleVault.connect(owner).addPool(100, true, UNIVERSE_POOL_USDC_WETH, 6000, 9000);
        await singleVault.connect(owner).addPool(100, false, UNIVERSE_POOL_USDC_WETH, 6000, 9000)
        console.log("singleVault add pool success");

        envHead = ten.getHead();
        console.log("env head :" + envHead);
    });

    it.skip("1、lendVault deposit and withdraw without lend", async function () {
        ten.setHead("fc21c931-4b34-4a9f-a84f-095b3dbe20ec")
        lendVault = await hre.ethers.getContractAt("LendVault", LEND_VAULT_ADDRESS);

        let shareTokenAddress = await lendVault.ibToken(WETH_ADDRESS);
        let shareToken = await hre.ethers.getContractAt("IBToken", shareTokenAddress);

        // 用户1充值，计算share正常
        await lendVault.connect(user1).deposit(WETH_ADDRESS, ethers.utils.parseEther("1"));
        let user1Share = await lendVault.ibShare(WETH_ADDRESS, USER_USER1);
        console.log("user1 share: " + user1Share);

        expect(user1Share).to.equal(ethers.utils.parseEther("1"));

        // 转账到金库0.01eth，造成share！= balance,模拟用户借贷计息的情况
        await weth.connect(swapper).transfer(lendVault.address, ethers.utils.parseEther("0.01"));

        let totalBalance = await lendVault.totalBalance(WETH_ADDRESS);
        console.log("total balance: " + totalBalance);
        let totalShare = await shareToken.totalSupply();
        console.log("total supply: " + totalShare)

        //用户2充值，计算用户2的share,计算正常
        await lendVault.connect(user2).deposit(WETH_ADDRESS, ethers.utils.parseEther("0.1"));
        let expectShare = ethers.utils.parseEther("0.1").mul(totalShare).div(totalBalance);
        let user2Share = await lendVault.ibShare(WETH_ADDRESS, USER_USER2);
        console.log("user2 share: " + user2Share);
        expect(user2Share).to.equal(expectShare);

        //记录总资产和总share
        totalBalance = await lendVault.totalBalance(WETH_ADDRESS);
        console.log("total balance after user2 deposit:" + totalBalance);
        totalShare = await shareToken.totalSupply();
        console.log("total share after user2 deposit:" + totalShare)

        // 提币前资产
        let user1BalanceBeforeWithdraw = await weth.balanceOf(USER_USER1);

        // 提币
        let withdrawShare = user1Share.div(ethers.utils.parseUnits("2", 0));
        console.log("withdraw share : " + withdrawShare);
        await lendVault.connect(user1).withdraw(WETH_ADDRESS, withdrawShare);

        // 提币后资产
        let user1BalanceAfterWithdraw = await weth.balanceOf(USER_USER1);

        // 预期检查
        let expectBalanceWithdraw = withdrawShare.mul(totalBalance).div(totalShare);
        let realBalanceWithdraw = user1BalanceAfterWithdraw.sub(user1BalanceBeforeWithdraw);
        expect(realBalanceWithdraw).to.equal(expectBalanceWithdraw);

        // 剩余share检查
        let expectRemainShare = user1Share.sub(withdrawShare);
        let realRemainShare = await lendVault.ibShare(WETH_ADDRESS, USER_USER1)
        expect(realRemainShare).to.equal(expectRemainShare);
    });

    it("1、lendVault deposit and withdraw with lend", async function () {
        ten.setHead("fc21c931-4b34-4a9f-a84f-095b3dbe20ec")
        lendVault = await hre.ethers.getContractAt("LendVault", LEND_VAULT_ADDRESS);
        singleVault = await hre.ethers.getContractAt("LeverageSingleVault", LEVERAGE_SINGLE_VAULT_ADDRESS);

        // swapper在借贷金库充值1eth用于借贷
        await lendVault.connect(swapper).deposit(WETH_ADDRESS, ethers.utils.parseEther("1"));

        let currentPid = await singleVault.currentPid();
        //swapper在杠杆金库借贷开仓，本金0.5eth，借贷0.5eth
        await singleVault.connect(swapper).openPosition(currentPid.sub(util.parseUnits("1", 0)), util.parseEther("0.5"), util.parseEther("0.5"))

    });
});


const setBalance = async function (address, amount) {
    await ethers.provider.send("tenderly_setBalance",
        [address,
            "0x" + amount.toString(16),]);
}
