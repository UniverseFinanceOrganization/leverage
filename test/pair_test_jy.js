const hre = require("hardhat");
const ethers = hre.ethers;
const util = ethers.utils;
const {expect} = require("chai");

const UNI_V3_SWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const UNI_V3_QUOTER_ADDRESS = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";
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
const USER_LOOKS_OWNER = "0x465a790b428268196865a3ae2648481ad7e0d3b1";


const USER_OWNER = "0x959290f09c9c75ab845fdb9d20ca3efdac229c5b";
const USER_USER1 = "0x08230c1628cc6fe1bbe005e03f10ae96c244778a";
const USER_USER2 = "0xa961cd7aac1a703de7a7bc970541e54db4fb453c";
const USER_SWAPPER = "0x72d2be90fcd6b454948db72e8a681979e36815af";


const x96 = util.parseUnits("2", 0).pow(96);


describe("Pair-Vault-Test", function () {

    let envHead = "a5404559-c09f-4fbd-9257-4371ec516d35";

    let ten = hre.tenderly.network();
    ten.setHead(envHead);
    ethers.provider = new ethers.providers.Web3Provider(ten);

    let interestModel, oracle, config, lendVault, singleVault, pairVault, testTick;
    let weth, usdc, usdt, wbtc, looks;
    let owner, user1, user2, swapper, universeOwner;
    let positionId;


    let INTEREST_MODEL_ADDRESS = "0x3BA6b68Ce591D8F42DB0FC2fD1119CB43560F708";
    let UNIV3_PRICE_ORACLE_ADDRESS = "0x28D9BB809B0A8773c73d559A483C817d9c69247f";
    let PROJECT_CONFIG_ADDRESS = "0x59e61A518ae41BF8DDdb2149FE6E2e5DC72012b6";
    let LEND_VAULT_ADDRESS = "0xd56B3FBE8ACE81025c3aDCf2194811dcCbA26e53";
    let LEVERAGE_PAIR_VAULT_ADDRESS = "0xaB703023A53c0840B517367aA365DD6CccDA4B94";
    let LEVERAGE_SINGLE_VAULT_ADDRESS = "0xeC7ca8B77e3305a37B42564EfA5a203f44BEd06F";
    let TEST_TICK_ADDRESS = "0xba8c9C36d733A30119f172f4E9C5ee5498B1CEF1";

    it("0.1 init user and load exist contract", async function () {
        // 账号初始化
        owner = await ethers.provider.getSigner(USER_OWNER);
        user1 = await ethers.provider.getSigner(USER_USER1);
        user2 = await ethers.provider.getSigner(USER_USER2);
        swapper = await ethers.provider.getSigner(USER_SWAPPER);
        universeOwner = await ethers.provider.getSigner(USER_UNIVERSE_VAULT_OWNER);
        console.log("init user success");

        // 加载资产合约
        weth = await ethers.getContractAt("IBToken", WETH_ADDRESS);
        usdc = await ethers.getContractAt("IBToken", USDC_ADDRESS);
        usdt = await ethers.getContractAt("IBToken", USDT_ADDRESS);
        wbtc = await ethers.getContractAt("IBToken", WBTC_ADDRESS);
        looks = await ethers.getContractAt("IBToken", LOOKS_ADDRESS);
        console.log("load token contract success");

        // 常用账号充值（eth）
        await setBalance(USER_OWNER, 1000 * 1e18);
        await setBalance(USER_USER1, 10000 * 1e18);
        await setBalance(USER_USER2, 10000 * 1e18);
        await setBalance(USER_SWAPPER, 10000 * 1e18);
        console.log("set balance eth success");


    });

    it.skip("0.2 deploy contract", async function () {
        // 部署合约
        const InterestModel = await hre.ethers.getContractFactory("InterestModel");
        interestModel = await InterestModel.connect(owner).deploy();
        await interestModel.deployed();
        console.log("interestModel deploy: ", interestModel.address);

        const UniV3PriceOracle = await hre.ethers.getContractFactory("UniV3PriceOracle");
        oracle = await UniV3PriceOracle.connect(owner).deploy();
        await oracle.deployed();
        console.log("oracle deploy: ", oracle.address);

        const ProjectConfig = await hre.ethers.getContractFactory("ProjectConfig");
        //利率、清算负债率、闪电贷利率、利率模型地址、预言机地址、强平者
        config = await ProjectConfig.connect(owner).deploy(3000, 9000, 20, interestModel.address, oracle.address, USER_OWNER);
        await config.deployed();
        console.log("config deploy: ", config.address);
        PROJECT_CONFIG_ADDRESS = config.address;

        const LendVault = await hre.ethers.getContractFactory("LendVault");
        lendVault = await LendVault.connect(owner).deploy(config.address);
        await lendVault.deployed();
        console.log("lendVault deploy: ", lendVault.address);
        LEND_VAULT_ADDRESS = lendVault.address;

        const LeveragePairVault = await hre.ethers.getContractFactory("LeveragePairVault");
        //address _lendVault, address _router, address _quoterAddress, address _config, address _dev
        pairVault = await LeveragePairVault.connect(owner).deploy(lendVault.address, UNI_V3_SWAP_ROUTER, UNI_V3_QUOTER_ADDRESS, config.address, USER_OWNER);
        await pairVault.deployed();
        console.log("LeveragePairVault deploy: ", pairVault.address);
        LEVERAGE_PAIR_VAULT_ADDRESS = pairVault.address;

        const LeverageSingleVault = await hre.ethers.getContractFactory("LeverageSingleVault");
        //address _lendVault, address _router, address _quoterAddress, address _config, address _dev
        singleVault = await LeverageSingleVault.connect(owner).deploy(lendVault.address, UNI_V3_SWAP_ROUTER, UNI_V3_QUOTER_ADDRESS, config.address, USER_OWNER);
        await singleVault.deployed();
        console.log("LeverageSingleVault deploy: ", singleVault.address);
        LEVERAGE_SINGLE_VAULT_ADDRESS = singleVault.address;

        const TestTick = await hre.ethers.getContractFactory("TestTick");
        testTick = await TestTick.connect(owner).deploy();
        await testTick.deployed();
        console.log("TestTick deploy: ", testTick.address);
        TEST_TICK_ADDRESS = testTick.address;


        // 借贷金库增加资产
        await lendVault.connect(owner).addBank(WETH_ADDRESS, 1, "iWETH", "iWETH");
        await lendVault.connect(owner).addBank(USDC_ADDRESS, 1, "iUSDC", "iUSDC");
        await lendVault.connect(owner).addBank(LOOKS_ADDRESS, 2, "iLOOKS", "iLOOKS");
        console.log("lendVault add bank success");

        // 借贷金库增加两个杠杆金库的借贷权限
        await lendVault.connect(owner).setDebtor(LEVERAGE_PAIR_VAULT_ADDRESS, true);
        await lendVault.connect(owner).setDebtor(LEVERAGE_SINGLE_VAULT_ADDRESS, true);
        console.log("lendVault add debtor success");

        // 杠杆双币金库增加借贷挖矿池
        await pairVault.connect(owner).addPool(100, UNIVERSE_POOL_WETH_LOOKS, 6000, 9000);
        // 杠杆单币金库增加借贷挖矿池
        // 最大价差/10000，是否池子token0，池子地址，开仓借贷占比/10000，强平借贷占比/10000
        await singleVault.connect(owner).addPool(100, true, UNIVERSE_POOL_USDC_WETH, 6000, 9000);
        await singleVault.connect(owner).addPool(100, false, UNIVERSE_POOL_USDC_WETH, 6000, 9000)
        console.log("leverage vault add pool success");


        // universe金库中增加杠杆金库的合约白名单
        let universePairVault = await hre.ethers.getContractAt("IUniversePairVault", UNIVERSE_POOL_WETH_LOOKS);
        await universePairVault.connect(universeOwner).updateWhiteList(LEVERAGE_PAIR_VAULT_ADDRESS, true);
        let universeVault = await hre.ethers.getContractAt("IUniverseVault", UNIVERSE_POOL_USDC_WETH);
        await universeVault.connect(universeOwner).updateWhiteList(LEVERAGE_SINGLE_VAULT_ADDRESS, true);
        console.log("universe vault add contract white list success");
    });

    it.skip("0.3 verify contract", async function () {
        await ten.verify({
            name: "InterestModel",
            address: INTEREST_MODEL_ADDRESS
        });
        await ten.verify({
            name: "UniV3PriceOracle",
            address: UNIV3_PRICE_ORACLE_ADDRESS
        });

        await ten.verify({
            name: "ProjectConfig",
            address: PROJECT_CONFIG_ADDRESS
        });
        await ten.verify({
            name: "LendVault",
            address: LEND_VAULT_ADDRESS
        });
        await ten.verify({
            name: "LeveragePairVault",
            address: LEVERAGE_PAIR_VAULT_ADDRESS
        });
        await ten.verify({
            name: "LeverageSingleVault",
            address: LEVERAGE_SINGLE_VAULT_ADDRESS
        });
        await ten.verify({
            name: "TestTick",
            address: TEST_TICK_ADDRESS
        });
    });

    it.skip("0.4 prepare account", async function () {

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
        await usdc.connect(usdcAccount).transfer(USER_USER1, ethers.utils.parseUnits("4000000", 6));
        await usdc.connect(usdcAccount).transfer(USER_USER2, ethers.utils.parseUnits("4000000", 6));
        await usdc.connect(usdcAccount).transfer(USER_SWAPPER, ethers.utils.parseUnits("40000000", 6));
        console.log("set balance usdc success");

        let usdtAccount = await ethers.provider.getSigner(USER_USDT_OWNER);
        await usdt.connect(usdtAccount).transfer(USER_USER1, ethers.utils.parseUnits("4000000", 6));
        await usdt.connect(usdtAccount).transfer(USER_USER2, ethers.utils.parseUnits("4000000", 6));
        await usdt.connect(usdtAccount).transfer(USER_SWAPPER, ethers.utils.parseUnits("40000000", 6));
        console.log("set balance usdt success");

        let wbtcAccount = await ethers.provider.getSigner(USER_WBTC_OWNER);
        await wbtc.connect(wbtcAccount).transfer(USER_USER1, ethers.utils.parseUnits("100", 8));
        await wbtc.connect(wbtcAccount).transfer(USER_USER2, ethers.utils.parseUnits("100", 8));
        await wbtc.connect(wbtcAccount).transfer(USER_SWAPPER, ethers.utils.parseUnits("1000", 8));
        console.log("set balance wbtc success");

        let looksAccount = await ethers.provider.getSigner(USER_LOOKS_OWNER);
        await looks.connect(looksAccount).transfer(USER_USER1, ethers.utils.parseUnits("4000000", 18));
        await looks.connect(looksAccount).transfer(USER_USER2, ethers.utils.parseUnits("4000000", 18));
        await looks.connect(looksAccount).transfer(USER_SWAPPER, ethers.utils.parseUnits("40000000", 18));
        console.log("set balance looks success");

        await weth.connect(user1).approve(LEND_VAULT_ADDRESS, await weth.balanceOf(USER_USER1));
        await weth.connect(user2).approve(LEND_VAULT_ADDRESS, await weth.balanceOf(USER_USER2));
        await weth.connect(swapper).approve(LEND_VAULT_ADDRESS, await weth.balanceOf(USER_SWAPPER));

        await usdc.connect(user1).approve(LEND_VAULT_ADDRESS, await usdc.balanceOf(USER_USER1));
        await usdc.connect(user2).approve(LEND_VAULT_ADDRESS, await usdc.balanceOf(USER_USER2));
        await usdc.connect(swapper).approve(LEND_VAULT_ADDRESS, await usdc.balanceOf(USER_SWAPPER));

        await usdt.connect(user1).approve(LEND_VAULT_ADDRESS, await usdt.balanceOf(USER_USER1));
        await usdt.connect(user2).approve(LEND_VAULT_ADDRESS, await usdt.balanceOf(USER_USER2));
        await usdt.connect(swapper).approve(LEND_VAULT_ADDRESS, await usdt.balanceOf(USER_SWAPPER));

        await looks.connect(user1).approve(LEND_VAULT_ADDRESS, await looks.balanceOf(USER_USER1));
        await looks.connect(user2).approve(LEND_VAULT_ADDRESS, await looks.balanceOf(USER_USER2));
        await looks.connect(swapper).approve(LEND_VAULT_ADDRESS, await looks.balanceOf(USER_SWAPPER));

        console.log("approve for lendVault success");

        await weth.connect(user1).approve(LEVERAGE_PAIR_VAULT_ADDRESS, await weth.balanceOf(USER_USER1));
        await weth.connect(user2).approve(LEVERAGE_PAIR_VAULT_ADDRESS, await weth.balanceOf(USER_USER2));
        await weth.connect(swapper).approve(LEVERAGE_PAIR_VAULT_ADDRESS, await weth.balanceOf(USER_SWAPPER));

        await usdc.connect(user1).approve(LEVERAGE_PAIR_VAULT_ADDRESS, await usdc.balanceOf(USER_USER1));
        await usdc.connect(user2).approve(LEVERAGE_PAIR_VAULT_ADDRESS, await usdc.balanceOf(USER_USER2));
        await usdc.connect(swapper).approve(LEVERAGE_PAIR_VAULT_ADDRESS, await usdc.balanceOf(USER_SWAPPER));

        await usdt.connect(user1).approve(LEVERAGE_PAIR_VAULT_ADDRESS, await usdt.balanceOf(USER_USER1));
        await usdt.connect(user2).approve(LEVERAGE_PAIR_VAULT_ADDRESS, await usdt.balanceOf(USER_USER2));
        await usdt.connect(swapper).approve(LEVERAGE_PAIR_VAULT_ADDRESS, await usdt.balanceOf(USER_SWAPPER));

        await looks.connect(user1).approve(LEVERAGE_PAIR_VAULT_ADDRESS, await looks.balanceOf(USER_USER1));
        await looks.connect(user2).approve(LEVERAGE_PAIR_VAULT_ADDRESS, await looks.balanceOf(USER_USER2));
        await looks.connect(swapper).approve(LEVERAGE_PAIR_VAULT_ADDRESS, await looks.balanceOf(USER_SWAPPER));

        console.log("approve for pairVault success");

        await weth.connect(user1).approve(LEVERAGE_SINGLE_VAULT_ADDRESS, await weth.balanceOf(USER_USER1));
        await weth.connect(user2).approve(LEVERAGE_SINGLE_VAULT_ADDRESS, await weth.balanceOf(USER_USER2));
        await weth.connect(swapper).approve(LEVERAGE_SINGLE_VAULT_ADDRESS, await weth.balanceOf(USER_SWAPPER));

        await usdc.connect(user1).approve(LEVERAGE_SINGLE_VAULT_ADDRESS, await usdc.balanceOf(USER_USER1));
        await usdc.connect(user2).approve(LEVERAGE_SINGLE_VAULT_ADDRESS, await usdc.balanceOf(USER_USER2));
        await usdc.connect(swapper).approve(LEVERAGE_SINGLE_VAULT_ADDRESS, await usdc.balanceOf(USER_SWAPPER));

        await usdt.connect(user1).approve(LEVERAGE_SINGLE_VAULT_ADDRESS, await usdt.balanceOf(USER_USER1));
        await usdt.connect(user2).approve(LEVERAGE_SINGLE_VAULT_ADDRESS, await usdt.balanceOf(USER_USER2));
        await usdt.connect(swapper).approve(LEVERAGE_SINGLE_VAULT_ADDRESS, await usdt.balanceOf(USER_SWAPPER));

        await looks.connect(user1).approve(LEVERAGE_SINGLE_VAULT_ADDRESS, await looks.balanceOf(USER_USER1));
        await looks.connect(user2).approve(LEVERAGE_SINGLE_VAULT_ADDRESS, await looks.balanceOf(USER_USER2));
        await looks.connect(swapper).approve(LEVERAGE_SINGLE_VAULT_ADDRESS, await looks.balanceOf(USER_SWAPPER));

        console.log("approve for singleVault success");

        await weth.connect(user1).approve(TEST_TICK_ADDRESS, await weth.balanceOf(USER_USER1));
        await weth.connect(user2).approve(TEST_TICK_ADDRESS, await weth.balanceOf(USER_USER2));
        await weth.connect(swapper).approve(TEST_TICK_ADDRESS, await weth.balanceOf(USER_SWAPPER));

        await usdc.connect(user1).approve(TEST_TICK_ADDRESS, await usdc.balanceOf(USER_USER1));
        await usdc.connect(user2).approve(TEST_TICK_ADDRESS, await usdc.balanceOf(USER_USER2));
        await usdc.connect(swapper).approve(TEST_TICK_ADDRESS, await usdc.balanceOf(USER_SWAPPER));

        await usdt.connect(user1).approve(TEST_TICK_ADDRESS, await usdt.balanceOf(USER_USER1));
        await usdt.connect(user2).approve(TEST_TICK_ADDRESS, await usdt.balanceOf(USER_USER2));
        await usdt.connect(swapper).approve(TEST_TICK_ADDRESS, await usdt.balanceOf(USER_SWAPPER));

        await looks.connect(user1).approve(TEST_TICK_ADDRESS, await looks.balanceOf(USER_USER1));
        await looks.connect(user2).approve(TEST_TICK_ADDRESS, await looks.balanceOf(USER_USER2));
        await looks.connect(swapper).approve(TEST_TICK_ADDRESS, await looks.balanceOf(USER_SWAPPER));

        console.log("approve for testTick success");

        envHead = ten.getHead();
        console.log("env head: " + envHead);
    });

    it.skip("1.1 lendVault deposit and withdraw without lend", async function () {
        ten.setHead(envHead)
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
        console.log("withdraw balance : " + realBalanceWithdraw);

        expect(realBalanceWithdraw).to.equal(expectBalanceWithdraw);

        // 剩余share检查
        let expectRemainShare = user1Share.sub(withdrawShare);
        let realRemainShare = await lendVault.ibShare(WETH_ADDRESS, USER_USER1);
        expect(realRemainShare).to.equal(expectRemainShare);
    });

    it.skip("1.2 lendVault deposit and withdraw with lend", async function () {
        ten.setHead(envHead)
        lendVault = await hre.ethers.getContractAt("LendVault", LEND_VAULT_ADDRESS);
        singleVault = await hre.ethers.getContractAt("LeverageSingleVault", LEVERAGE_SINGLE_VAULT_ADDRESS);
        pairVault = await hre.ethers.getContractAt("LeveragePairVault", LEVERAGE_PAIR_VAULT_ADDRESS);
        let universeVault = await hre.ethers.getContractAt("IUniversePairVault", UNIVERSE_POOL_WETH_LOOKS);

        let shareTokenAddress = await lendVault.ibToken(WETH_ADDRESS);
        let shareToken = await hre.ethers.getContractAt("IBToken", shareTokenAddress);

        await lendVault.connect(swapper).deposit(WETH_ADDRESS, ethers.utils.parseEther("1"));
        await lendVault.connect(swapper).deposit(LOOKS_ADDRESS, ethers.utils.parseEther("8000"));

        //获取开仓请求的数据
        let currentPid = await pairVault.currentPid();
        let poolIdx = currentPid.sub(util.parseUnits("1", 0));
        let poolAddress = await pairVault.poolIndex(poolIdx);

        // 获取双币池资产比例
        let totalAmounts = await universeVault.getTotalAmounts();
        let token0Amount = totalAmounts[0];
        let token1Amount = totalAmounts[1];

        // swapper 发起借贷
        let openAmount0 = util.parseEther("0.5");
        let openAmount1 = openAmount0.mul(token1Amount).div(token0Amount);
        await pairVault.connect(swapper).openPosition(poolAddress, openAmount0, openAmount1, openAmount0, openAmount1);

        let totalBalance = await lendVault.totalBalance(WETH_ADDRESS);
        console.log("totalBalance1: " + totalBalance)
        let totalShare = await shareToken.totalSupply();
        await lendVault.connect(user1).deposit(WETH_ADDRESS, util.parseEther("1"));

        totalBalance = await lendVault.totalBalance(WETH_ADDRESS);
        let preTotalBalance = totalBalance.sub(util.parseEther("1"));
        console.log("totalBalance2: " + totalBalance)

        // 充值share计算正确
        let expectShare = util.parseEther("1").mul(totalShare).div(preTotalBalance);
        let realShare = await lendVault.ibShare(WETH_ADDRESS, USER_USER1);
        console.log("user1 real share: " + realShare);
        expect(realShare).to.equal(expectShare);

        let preBalance = await weth.balanceOf(USER_USER1);
        await lendVault.connect(user1).withdraw(WETH_ADDRESS, realShare);
        let afterBalance = await weth.balanceOf(USER_USER1);
        // 因为涉及到计息的情况，所以这里没办法精确计算
        console.log("user1 withdraw amount: " + afterBalance.sub(preBalance));

        // user1再次充值
        await lendVault.connect(user1).deposit(WETH_ADDRESS, util.parseEther("1"));

        // swapper 再次发起借贷，是剩余资产不足以user1全额提取
        openAmount0 = util.parseEther("1");
        openAmount1 = openAmount0.mul(token1Amount).div(token0Amount);
        await pairVault.connect(swapper).openPosition(poolAddress, openAmount0, openAmount1, openAmount0, openAmount1);

        let shareBeforeWithdraw = await lendVault.ibShare(WETH_ADDRESS, USER_USER1);

        let balanceBeforeWithdraw = await weth.balanceOf(USER_USER1);
        await lendVault.connect(user1).withdraw(WETH_ADDRESS, realShare);
        let balanceAfterWithdraw = await weth.balanceOf(USER_USER1);
        let shareAfterWithdraw = await lendVault.ibShare(WETH_ADDRESS, USER_USER1);

        // 因为涉及到计息的情况，所以这里没办法精确计算
        console.log("user1 second withdraw amount: " + balanceAfterWithdraw.sub(balanceBeforeWithdraw));
        console.log("user1 second burn share amount: " + shareBeforeWithdraw.sub(shareAfterWithdraw));
    });

    it.skip("2.1 pairVault open and close position", async function () {

        ten.setHead(envHead)
        lendVault = await hre.ethers.getContractAt("LendVault", LEND_VAULT_ADDRESS);
        singleVault = await hre.ethers.getContractAt("LeverageSingleVault", LEVERAGE_SINGLE_VAULT_ADDRESS);
        pairVault = await hre.ethers.getContractAt("LeveragePairVault", LEVERAGE_PAIR_VAULT_ADDRESS);

        //swapper在借贷金库充值
        await lendVault.connect(swapper).deposit(WETH_ADDRESS, ethers.utils.parseEther("2"));
        await lendVault.connect(swapper).deposit(LOOKS_ADDRESS, ethers.utils.parseEther("8000"));

        //获取开仓请求的数据 poolIdx和poolAddress
        let currentPid = await pairVault.currentPid();
        let poolIdx = currentPid.sub(util.parseUnits("1", 0));
        let poolAddress = await pairVault.poolIndex(poolIdx);

        // 获取双币池资产比例
        let universeVault = await hre.ethers.getContractAt("IUniversePairVault", UNIVERSE_POOL_WETH_LOOKS);
        let totalAmounts = await universeVault.getTotalAmounts();
        let token0Amount = totalAmounts[0];
        let token1Amount = totalAmounts[1];

        let openAmount0 = util.parseEther("0.5");
        let openAmount1 = openAmount0.mul(token1Amount).div(token0Amount);

        let beforeOpenPoolInfo = await pairVault.pools(UNIVERSE_POOL_WETH_LOOKS);
        let beforeOpenBank0Info = await lendVault.banks(WETH_ADDRESS);
        let beforeOpenBank1Info = await lendVault.banks(LOOKS_ADDRESS);
        let beforeOpenVaultDebitShare0 = await lendVault.getDebt(WETH_ADDRESS, LEVERAGE_PAIR_VAULT_ADDRESS);
        let beforeOpenVaultDebitShare1 = await lendVault.getDebt(LOOKS_ADDRESS, LEVERAGE_PAIR_VAULT_ADDRESS);

        // positionId不会返回，自己记录
        positionId = await pairVault.currentPos();
        await pairVault.connect(user1).openPosition(poolAddress, openAmount0, openAmount1, openAmount0, openAmount1);

        let afterOpenPoolInfo = await pairVault.pools(UNIVERSE_POOL_WETH_LOOKS);
        let afterOpenBank0Info = await lendVault.banks(WETH_ADDRESS);
        let afterOpenBank1Info = await lendVault.banks(LOOKS_ADDRESS);
        let afterOpenVaultDebitShare0 = await lendVault.getDebt(WETH_ADDRESS, LEVERAGE_PAIR_VAULT_ADDRESS);
        let afterOpenVaultDebitShare1 = await lendVault.getDebt(LOOKS_ADDRESS, LEVERAGE_PAIR_VAULT_ADDRESS);

        let debitShare0 = afterOpenBank0Info.totalDebtShare.sub(beforeOpenBank0Info.totalDebtShare);
        let debitShare1 = afterOpenBank1Info.totalDebtShare.sub(beforeOpenBank1Info.totalDebtShare);
        let vaultShare = afterOpenPoolInfo.share.sub(beforeOpenPoolInfo.share);
        let vaultDebitShare0Add = afterOpenVaultDebitShare0.sub(beforeOpenVaultDebitShare0);
        let vaultDebitShare1Add = afterOpenVaultDebitShare1.sub(beforeOpenVaultDebitShare1);


        let positionInfo = await pairVault.positions(positionId);

        let posDebitShare0 = positionInfo.debtShare0;
        let posDebitShare1 = positionInfo.debtShare1;
        let posShare = positionInfo.share;

        expect(posDebitShare0).to.equal(debitShare0);
        expect(posDebitShare1).to.equal(debitShare1);
        expect(posDebitShare0).to.equal(vaultDebitShare0Add);
        expect(posDebitShare1).to.equal(vaultDebitShare1Add);
        expect(posShare).to.equal(vaultShare);


        let positionHealth = await pairVault.posHealth(positionId);
        console.log("仓位负债率：" + positionHealth)

        await pairVault.connect(user1).closePosition(positionId);

        let afterClosePoolInfo = await pairVault.pools(UNIVERSE_POOL_WETH_LOOKS);
        let afterCloseBank0Info = await lendVault.banks(WETH_ADDRESS);
        let afterCloseBank1Info = await lendVault.banks(LOOKS_ADDRESS);
        let afterCloseVaultDebitShare0 = await lendVault.getDebt(WETH_ADDRESS, LEVERAGE_PAIR_VAULT_ADDRESS);
        let afterCloseVaultDebitShare1 = await lendVault.getDebt(LOOKS_ADDRESS, LEVERAGE_PAIR_VAULT_ADDRESS);

        debitShare0 = afterOpenBank0Info.totalDebtShare.sub(afterCloseBank0Info.totalDebtShare);
        debitShare1 = afterOpenBank1Info.totalDebtShare.sub(afterCloseBank1Info.totalDebtShare);
        vaultShare = afterOpenPoolInfo.share.sub(afterClosePoolInfo.share);
        vaultDebitShare0Add = afterOpenVaultDebitShare0.sub(afterCloseVaultDebitShare0);
        vaultDebitShare1Add = afterOpenVaultDebitShare1.sub(afterCloseVaultDebitShare1);

        expect(posDebitShare0).to.equal(debitShare0);
        expect(posDebitShare1).to.equal(debitShare1);
        expect(posDebitShare0).to.equal(vaultDebitShare0Add);
        expect(posDebitShare1).to.equal(vaultDebitShare1Add);
        expect(posShare).to.equal(vaultShare);

    });

    it.skip("2.2 pairVault open and cover position", async function () {

        ten.setHead(envHead)
        lendVault = await hre.ethers.getContractAt("LendVault", LEND_VAULT_ADDRESS);
        singleVault = await hre.ethers.getContractAt("LeverageSingleVault", LEVERAGE_SINGLE_VAULT_ADDRESS);
        pairVault = await hre.ethers.getContractAt("LeveragePairVault", LEVERAGE_PAIR_VAULT_ADDRESS);

        //swapper在借贷金库充值
        await lendVault.connect(swapper).deposit(WETH_ADDRESS, ethers.utils.parseEther("2"));
        await lendVault.connect(swapper).deposit(LOOKS_ADDRESS, ethers.utils.parseEther("8000"));

        //获取开仓请求的数据 poolIdx和poolAddress
        let currentPid = await pairVault.currentPid();
        let poolIdx = currentPid.sub(util.parseUnits("1", 0));
        let poolAddress = await pairVault.poolIndex(poolIdx);

        // 获取双币池资产比例
        let universeVault = await hre.ethers.getContractAt("IUniversePairVault", UNIVERSE_POOL_WETH_LOOKS);
        let totalAmounts = await universeVault.getTotalAmounts();
        let token0Amount = totalAmounts[0];
        let token1Amount = totalAmounts[1];

        let openAmount0 = util.parseEther("0.5");
        let openAmount1 = openAmount0.mul(token1Amount).div(token0Amount);

        // positionId不会返回，自己记录
        positionId = await pairVault.currentPos();
        await pairVault.connect(user1).openPosition(poolAddress, openAmount0, openAmount1, openAmount0, openAmount1);

        let positionInfoBeforeCover = await pairVault.positions(positionId);
        let posShareBeforeCover = positionInfoBeforeCover.share;

        let positionHealth = await pairVault.posHealth(positionId);
        console.log("仓位负债率：" + positionHealth)

        let beforeCoverPoolInfo = await pairVault.pools(UNIVERSE_POOL_WETH_LOOKS);
        let beforeCoverBank0Info = await lendVault.banks(WETH_ADDRESS);
        let beforeCoverBank1Info = await lendVault.banks(LOOKS_ADDRESS);
        let beforeCoverVaultDebitShare0 = await lendVault.getDebt(WETH_ADDRESS, LEVERAGE_PAIR_VAULT_ADDRESS);
        let beforeCoverVaultDebitShare1 = await lendVault.getDebt(LOOKS_ADDRESS, LEVERAGE_PAIR_VAULT_ADDRESS);

        await pairVault.connect(user1).coverPosition(positionId, openAmount0, openAmount1);
        let positionInfoAfterCover = await pairVault.positions(positionId);
        let posShareAfterCover = positionInfoAfterCover.share;

        let afterCoverPoolInfo = await pairVault.pools(UNIVERSE_POOL_WETH_LOOKS);
        let afterCoverBank0Info = await lendVault.banks(WETH_ADDRESS);
        let afterCoverBank1Info = await lendVault.banks(LOOKS_ADDRESS);
        let afterCoverVaultDebitShare0 = await lendVault.getDebt(WETH_ADDRESS, LEVERAGE_PAIR_VAULT_ADDRESS);
        let afterCoverVaultDebitShare1 = await lendVault.getDebt(LOOKS_ADDRESS, LEVERAGE_PAIR_VAULT_ADDRESS);

        let posShareChange = posShareAfterCover.sub(posShareBeforeCover);
        let vaultShareChange = afterCoverPoolInfo.share.sub(beforeCoverPoolInfo.share);

        expect(posShareChange).to.equal(vaultShareChange);

        expect(afterCoverBank0Info.totalDebtShare).to.equal(beforeCoverBank0Info.totalDebtShare);
        expect(afterCoverBank1Info.totalDebtShare).to.equal(beforeCoverBank1Info.totalDebtShare);

        expect(afterCoverVaultDebitShare0).to.equal(beforeCoverVaultDebitShare0);
        expect(afterCoverVaultDebitShare1).to.equal(beforeCoverVaultDebitShare1);

        positionHealth = await pairVault.posHealth(positionId);
        console.log("补仓之后仓位负债率：" + positionHealth)
    });

    it.skip("2.3 pairVault liquidate Position has enough to pay", async function () {

        ten.setHead(envHead)
        lendVault = await hre.ethers.getContractAt("LendVault", LEND_VAULT_ADDRESS);
        singleVault = await hre.ethers.getContractAt("LeverageSingleVault", LEVERAGE_SINGLE_VAULT_ADDRESS);
        pairVault = await hre.ethers.getContractAt("LeveragePairVault", LEVERAGE_PAIR_VAULT_ADDRESS);

        //swapper在借贷金库充值
        await lendVault.connect(swapper).deposit(WETH_ADDRESS, ethers.utils.parseEther("5"));
        await lendVault.connect(swapper).deposit(LOOKS_ADDRESS, ethers.utils.parseEther("25000"));

        //获取开仓请求的数据 poolIdx和poolAddress
        let currentPid = await pairVault.currentPid();
        let poolIdx = currentPid.sub(util.parseUnits("1", 0));
        let poolAddress = await pairVault.poolIndex(poolIdx);

        // 获取双币池资产比例
        let universeVault = await hre.ethers.getContractAt("IUniversePairVault", UNIVERSE_POOL_WETH_LOOKS);
        let totalAmounts = await universeVault.getTotalAmounts();
        let token0Amount = totalAmounts[0];
        let token1Amount = totalAmounts[1];

        let openAmount0 = util.parseEther("0.5");
        let openAmount1 = openAmount0.mul(token1Amount).div(token0Amount);

        let debitAmount0 = util.parseEther("2.5");
        let debitAmount1 = debitAmount0.mul(token1Amount).div(token0Amount);

        // 调整仓位开仓负债率
        await pairVault.connect(owner).updatePool(true, 100, UNIVERSE_POOL_WETH_LOOKS, 8500, 9000);

        // positionId不会返回，自己记录
        positionId = await pairVault.currentPos();
        await pairVault.connect(user1).openPosition(poolAddress, openAmount0, openAmount1, debitAmount0, debitAmount1);

        let positionInfo = await pairVault.positions(positionId);
        let posDebitShare0 = positionInfo.debtShare0;
        let posDebitShare1 = positionInfo.debtShare1;
        let posShare = positionInfo.share;

        let positionHealth = await pairVault.posHealth(positionId);
        console.log("仓位负债率：" + positionHealth)

        // 再次调整开仓负债率，调整至可爆仓
        await pairVault.connect(owner).updatePool(true, 100, UNIVERSE_POOL_WETH_LOOKS, 6000, 8000);

        let preEth = await weth.balanceOf(USER_OWNER);
        let preLooks = await looks.balanceOf(USER_OWNER);

        let beforeLiquidatePoolInfo = await pairVault.pools(UNIVERSE_POOL_WETH_LOOKS);
        let beforeLiquidateBank0Info = await lendVault.banks(WETH_ADDRESS);
        let beforeLiquidateBank1Info = await lendVault.banks(LOOKS_ADDRESS);
        let beforeLiquidateVaultDebitShare0 = await lendVault.getDebt(WETH_ADDRESS, LEVERAGE_PAIR_VAULT_ADDRESS);
        let beforeLiquidateVaultDebitShare1 = await lendVault.getDebt(LOOKS_ADDRESS, LEVERAGE_PAIR_VAULT_ADDRESS);

        await pairVault.connect(owner).liquidate(positionId);

        let afterEth = await weth.balanceOf(USER_OWNER);
        let afterLooks = await looks.balanceOf(USER_OWNER);

        let afterLiquidatePoolInfo = await pairVault.pools(UNIVERSE_POOL_WETH_LOOKS);
        let afterLiquidateBank0Info = await lendVault.banks(WETH_ADDRESS);
        let afterLiquidateBank1Info = await lendVault.banks(LOOKS_ADDRESS);
        let afterLiquidateVaultDebitShare0 = await lendVault.getDebt(WETH_ADDRESS, LEVERAGE_PAIR_VAULT_ADDRESS);
        let afterLiquidateVaultDebitShare1 = await lendVault.getDebt(LOOKS_ADDRESS, LEVERAGE_PAIR_VAULT_ADDRESS);

        let vaultShare = beforeLiquidatePoolInfo.share.sub(afterLiquidatePoolInfo.share);
        let debitShare0 = beforeLiquidateBank0Info.totalDebtShare.sub(afterLiquidateBank0Info.totalDebtShare);
        let debitShare1 = beforeLiquidateBank1Info.totalDebtShare.sub(afterLiquidateBank1Info.totalDebtShare);
        let vaultDebitShare0Add = beforeLiquidateVaultDebitShare0.sub(afterLiquidateVaultDebitShare0);
        let vaultDebitShare1Add = beforeLiquidateVaultDebitShare1.sub(afterLiquidateVaultDebitShare1);

        expect(posShare).to.equal(vaultShare);
        expect(posDebitShare0).to.equal(debitShare0);
        expect(posDebitShare1).to.equal(debitShare1);
        expect(posDebitShare0).to.equal(vaultDebitShare0Add);
        expect(posDebitShare1).to.equal(vaultDebitShare1Add);


        console.log("user2 get eth : " + afterEth.sub(preEth));
        console.log("user2 get looks : " + afterLooks.sub(preLooks));

    });

    it("2.4 pairVault liquidate Position has not enough to pay , token0 for token1", async function () {

        ten.setHead(envHead)
        lendVault = await hre.ethers.getContractAt("LendVault", LEND_VAULT_ADDRESS);
        singleVault = await hre.ethers.getContractAt("LeverageSingleVault", LEVERAGE_SINGLE_VAULT_ADDRESS);
        pairVault = await hre.ethers.getContractAt("LeveragePairVault", LEVERAGE_PAIR_VAULT_ADDRESS);
        testTick = await hre.ethers.getContractAt("TestTick", TEST_TICK_ADDRESS);


        //swapper在借贷金库充值
        await lendVault.connect(swapper).deposit(WETH_ADDRESS, ethers.utils.parseEther("5"));
        await lendVault.connect(swapper).deposit(LOOKS_ADDRESS, ethers.utils.parseEther("25000"));

        //获取开仓请求的数据 poolIdx和poolAddress
        let currentPid = await pairVault.currentPid();
        let poolIdx = currentPid.sub(util.parseUnits("1", 0));
        let poolAddress = await pairVault.poolIndex(poolIdx);

        // 获取双币池资产比例
        let universeVault = await hre.ethers.getContractAt("IUniversePairVault", UNIVERSE_POOL_WETH_LOOKS);
        let totalAmounts = await universeVault.getTotalAmounts();
        let token0Amount = totalAmounts[0];
        let token1Amount = totalAmounts[1];

        let universeVaultInfo = await universeVault.positionList(0);
        let uniSwapPoolAddress = universeVaultInfo[2];
        let lowerTick = universeVaultInfo[3];
        let upperTick = universeVaultInfo[4];
        let tickRange = upperTick - lowerTick;
        let uniSwapPool = await hre.ethers.getContractAt("IUniswapV3Pool", uniSwapPoolAddress);

        let openAmount0 = util.parseEther("0.5");
        let openAmount1 = openAmount0.mul(token1Amount).div(token0Amount);

        let debitAmount0 = util.parseEther("2.5");
        let debitAmount1 = debitAmount0.mul(token1Amount).div(token0Amount);

        // 调整仓位开仓负债率，方便触发爆仓
        await pairVault.connect(owner).updatePool(true, 100, UNIVERSE_POOL_WETH_LOOKS, 8500, 9000);

        // positionId不会返回，自己记录
        positionId = await pairVault.currentPos();
        await pairVault.connect(user1).openPosition(poolAddress, openAmount0, openAmount1, debitAmount0, debitAmount1);

        let positionInfo = await pairVault.positions(positionId);
        let posDebitShare0 = positionInfo.debtShare0;
        let posDebitShare1 = positionInfo.debtShare1;
        let posShare = positionInfo.share;

        let slotBeforeSwap = await uniSwapPool.slot0();
        console.log("tick before swap: " + slotBeforeSwap[1]);

        let positionHealth = await pairVault.posHealth(positionId);
        console.log("仓位负债率：" + positionHealth)

        let balanceInfo = await pairVault.connect(user1).closePositionPre(positionId);
        console.log(balanceInfo)

        //( swapPool,  zeroForOne,  _amountIn,  to,  targetTick)大量冲入weth，tick变小
        await testTick.connect(swapper).swap(uniSwapPoolAddress, true, await weth.balanceOf(USER_SWAPPER), USER_SWAPPER, lowerTick);

        positionHealth = await pairVault.posHealth(positionId);
        console.log("仓位负债率：" + positionHealth)

        balanceInfo = await pairVault.connect(user1).closePositionPre(positionId);
        console.log("" + balanceInfo)

        await testTick.connect(swapper).swap(uniSwapPoolAddress, true, await weth.balanceOf(USER_SWAPPER), USER_SWAPPER, lowerTick - tickRange);


        // 延迟20秒，满足预言机检查
        await sleep(20 * 1000);

        let slotAfterSwap = await uniSwapPool.slot0();
        console.log("tick after swap: " + slotAfterSwap[1]);

        positionHealth = await pairVault.posHealth(positionId);
        console.log("仓位负债率：" + positionHealth)

        let preEth = await weth.balanceOf(USER_OWNER);
        let preLooks = await looks.balanceOf(USER_OWNER);

        let beforeLiquidatePoolInfo = await pairVault.pools(UNIVERSE_POOL_WETH_LOOKS);
        let beforeLiquidateBank0Info = await lendVault.banks(WETH_ADDRESS);
        let beforeLiquidateBank1Info = await lendVault.banks(LOOKS_ADDRESS);
        let beforeLiquidateVaultDebitShare0 = await lendVault.getDebt(WETH_ADDRESS, LEVERAGE_PAIR_VAULT_ADDRESS);
        let beforeLiquidateVaultDebitShare1 = await lendVault.getDebt(LOOKS_ADDRESS, LEVERAGE_PAIR_VAULT_ADDRESS);

        await pairVault.connect(owner).liquidate(positionId);
        let afterEth = await weth.balanceOf(USER_OWNER);
        let afterLooks = await looks.balanceOf(USER_OWNER);


        let afterLiquidatePoolInfo = await pairVault.pools(UNIVERSE_POOL_WETH_LOOKS);
        let afterLiquidateBank0Info = await lendVault.banks(WETH_ADDRESS);
        let afterLiquidateBank1Info = await lendVault.banks(LOOKS_ADDRESS);
        let afterLiquidateVaultDebitShare0 = await lendVault.getDebt(WETH_ADDRESS, LEVERAGE_PAIR_VAULT_ADDRESS);
        let afterLiquidateVaultDebitShare1 = await lendVault.getDebt(LOOKS_ADDRESS, LEVERAGE_PAIR_VAULT_ADDRESS);

        let vaultShare = beforeLiquidatePoolInfo.share.sub(afterLiquidatePoolInfo.share);
        let debitShare0 = beforeLiquidateBank0Info.totalDebtShare.sub(afterLiquidateBank0Info.totalDebtShare);
        let debitShare1 = beforeLiquidateBank1Info.totalDebtShare.sub(afterLiquidateBank1Info.totalDebtShare);
        let vaultDebitShare0Add = beforeLiquidateVaultDebitShare0.sub(afterLiquidateVaultDebitShare0);
        let vaultDebitShare1Add = beforeLiquidateVaultDebitShare1.sub(afterLiquidateVaultDebitShare1);

        expect(posShare).to.equal(vaultShare);
        expect(posDebitShare0).to.equal(debitShare0);
        expect(posDebitShare1).to.equal(debitShare1);
        expect(posDebitShare0).to.equal(vaultDebitShare0Add);
        expect(posDebitShare1).to.equal(vaultDebitShare1Add);

        console.log("user2 get eth : " + afterEth.sub(preEth));
        console.log("user2 get looks : " + afterLooks.sub(preLooks));
    });

    it("2.5 pairVault liquidate Position has not enough to pay , token1 for token0", async function () {

        ten.setHead(envHead)
        lendVault = await hre.ethers.getContractAt("LendVault", LEND_VAULT_ADDRESS);
        singleVault = await hre.ethers.getContractAt("LeverageSingleVault", LEVERAGE_SINGLE_VAULT_ADDRESS);
        pairVault = await hre.ethers.getContractAt("LeveragePairVault", LEVERAGE_PAIR_VAULT_ADDRESS);
        testTick = await hre.ethers.getContractAt("TestTick", TEST_TICK_ADDRESS);


        //swapper在借贷金库充值
        await lendVault.connect(swapper).deposit(WETH_ADDRESS, ethers.utils.parseEther("5"));
        await lendVault.connect(swapper).deposit(LOOKS_ADDRESS, ethers.utils.parseEther("25000"));

        //获取开仓请求的数据 poolIdx和poolAddress
        let currentPid = await pairVault.currentPid();
        let poolIdx = currentPid.sub(util.parseUnits("1", 0));
        let poolAddress = await pairVault.poolIndex(poolIdx);

        // 获取双币池资产比例
        let universeVault = await hre.ethers.getContractAt("IUniversePairVault", UNIVERSE_POOL_WETH_LOOKS);
        let totalAmounts = await universeVault.getTotalAmounts();
        let token0Amount = totalAmounts[0];
        let token1Amount = totalAmounts[1];

        let universeVaultInfo = await universeVault.positionList(0);
        let uniSwapPoolAddress = universeVaultInfo[2];
        let lowerTick = universeVaultInfo[3];
        let upperTick = universeVaultInfo[4];
        let tickRange = upperTick - lowerTick;
        let uniSwapPool = await hre.ethers.getContractAt("IUniswapV3Pool", uniSwapPoolAddress);

        let openAmount0 = util.parseEther("0.5");
        let openAmount1 = openAmount0.mul(token1Amount).div(token0Amount);

        let debitAmount0 = util.parseEther("2.5");
        let debitAmount1 = debitAmount0.mul(token1Amount).div(token0Amount);

        // 调整仓位开仓负债率，方便触发爆仓
        await pairVault.connect(owner).updatePool(true, 100, UNIVERSE_POOL_WETH_LOOKS, 8500, 9000);

        // positionId不会返回，自己记录
        positionId = await pairVault.currentPos();
        await pairVault.connect(user1).openPosition(poolAddress, openAmount0, openAmount1, debitAmount0, debitAmount1);

        let positionInfo = await pairVault.positions(positionId);
        let posDebitShare0 = positionInfo.debtShare0;
        let posDebitShare1 = positionInfo.debtShare1;
        let posShare = positionInfo.share;

        let slotBeforeSwap = await uniSwapPool.slot0();
        console.log("tick before swap: " + slotBeforeSwap[1]);

        let positionHealth = await pairVault.posHealth(positionId);
        console.log("仓位负债率：" + positionHealth)

        //( swapPool,  zeroForOne,  _amountIn,  to,  targetTick)大量冲入looks，tick变大
        await testTick.connect(swapper).swap(uniSwapPoolAddress, false, await looks.balanceOf(USER_SWAPPER), USER_SWAPPER, upperTick);

        positionHealth = await pairVault.posHealth(positionId);
        console.log("仓位负债率：" + positionHealth)

        let balanceInfo = await pairVault.connect(user1).closePositionPre(positionId);
        console.log("" + balanceInfo)

        await testTick.connect(swapper).swap(uniSwapPoolAddress, false, await looks.balanceOf(USER_SWAPPER), USER_SWAPPER, upperTick + tickRange);


        // 延迟20秒，满足预言机检查
        await sleep(20 * 1000);

        let slotAfterSwap = await uniSwapPool.slot0();
        console.log("tick after swap: " + slotAfterSwap[1]);

        positionHealth = await pairVault.posHealth(positionId);
        console.log("仓位负债率：" + positionHealth)

        let preEth = await weth.balanceOf(USER_OWNER);
        let preLooks = await looks.balanceOf(USER_OWNER);

        let beforeLiquidatePoolInfo = await pairVault.pools(UNIVERSE_POOL_WETH_LOOKS);
        let beforeLiquidateBank0Info = await lendVault.banks(WETH_ADDRESS);
        let beforeLiquidateBank1Info = await lendVault.banks(LOOKS_ADDRESS);
        let beforeLiquidateVaultDebitShare0 = await lendVault.getDebt(WETH_ADDRESS, LEVERAGE_PAIR_VAULT_ADDRESS);
        let beforeLiquidateVaultDebitShare1 = await lendVault.getDebt(LOOKS_ADDRESS, LEVERAGE_PAIR_VAULT_ADDRESS);

        await pairVault.connect(owner).liquidate(positionId);
        let afterEth = await weth.balanceOf(USER_OWNER);
        let afterLooks = await looks.balanceOf(USER_OWNER);


        let afterLiquidatePoolInfo = await pairVault.pools(UNIVERSE_POOL_WETH_LOOKS);
        let afterLiquidateBank0Info = await lendVault.banks(WETH_ADDRESS);
        let afterLiquidateBank1Info = await lendVault.banks(LOOKS_ADDRESS);
        let afterLiquidateVaultDebitShare0 = await lendVault.getDebt(WETH_ADDRESS, LEVERAGE_PAIR_VAULT_ADDRESS);
        let afterLiquidateVaultDebitShare1 = await lendVault.getDebt(LOOKS_ADDRESS, LEVERAGE_PAIR_VAULT_ADDRESS);

        let vaultShare = beforeLiquidatePoolInfo.share.sub(afterLiquidatePoolInfo.share);
        let debitShare0 = beforeLiquidateBank0Info.totalDebtShare.sub(afterLiquidateBank0Info.totalDebtShare);
        let debitShare1 = beforeLiquidateBank1Info.totalDebtShare.sub(afterLiquidateBank1Info.totalDebtShare);
        let vaultDebitShare0Add = beforeLiquidateVaultDebitShare0.sub(afterLiquidateVaultDebitShare0);
        let vaultDebitShare1Add = beforeLiquidateVaultDebitShare1.sub(afterLiquidateVaultDebitShare1);

        expect(posShare).to.equal(vaultShare);
        expect(posDebitShare0).to.equal(debitShare0);
        expect(posDebitShare1).to.equal(debitShare1);
        expect(posDebitShare0).to.equal(vaultDebitShare0Add);
        expect(posDebitShare1).to.equal(vaultDebitShare1Add);

        console.log("user2 get eth : " + afterEth.sub(preEth));
        console.log("user2 get looks : " + afterLooks.sub(preLooks));
    });

});


const setBalance = async function (address, amount) {
    await ethers.provider.send("tenderly_setBalance",
        [address,
            "0x" + amount.toString(16),]);
}

function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

