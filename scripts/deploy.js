const hre = require("hardhat");
const OWNER_ADDRESS = "0x959290f09c9c75ab845fdb9d20ca3efdac229c5b";

const UNI_V3_SWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const UNI_V3_QUOTER_ADDRESS = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6";
const UNIVERSE_POOL_USDC_WETH = "0xa2d62728Cc10b256aBB1aA908A6559F85095BdEd";
const UNIVERSE_POOL_WETH_LOOKS = "0xbc044Ab5a8BFa595CBCEf0abD8620b555d271E6F"

const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const USDC_ADDRESS = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const LOOKS_ADDRESS = "0xf4d2888d29D722226FafA5d9B24F9164c092421E";

async function main() {

    const InterestModel = await hre.ethers.getContractFactory("InterestModel");
    const interestModel = await InterestModel.deploy();
    await interestModel.deployed();
    console.log("InterestModel deployed to:", interestModel.address);

    const UniV3PriceOracle = await hre.ethers.getContractFactory("UniV3PriceOracle");
    const uniV3PriceOracle = await UniV3PriceOracle.deploy();
    await uniV3PriceOracle.deployed();
    console.log("UniV3PriceOracle deployed to:", uniV3PriceOracle.address);

    const ProjectConfig = await hre.ethers.getContractFactory("ProjectConfig");
    //利率、清算负债率、闪电贷利率、利率模型地址、预言机地址
    const projectConfig = await ProjectConfig.deploy(2000, 500, 20, interestModel.address, uniV3PriceOracle.address,OWNER_ADDRESS);
    await projectConfig.deployed();
    console.log("ProjectConfig deployed to:", projectConfig.address);

    const LendVault = await hre.ethers.getContractFactory("LendVault");
    const lendVault = await LendVault.deploy(projectConfig.address);
    await lendVault.deployed();
    console.log("LendVault deployed to:", lendVault.address);

    const LeveragePairVault = await hre.ethers.getContractFactory("LeveragePairVault");
    //address _lendVault, address _router, address _quoterAddress, address _config, address _dev
    const leveragePairVault = await LeveragePairVault.deploy(lendVault.address, UNI_V3_SWAP_ROUTER, UNI_V3_QUOTER_ADDRESS, projectConfig.address, OWNER_ADDRESS);
    await leveragePairVault.deployed();
    console.log("LeveragePairVault deployed to:", leveragePairVault.address);

    const LeverageSingleVault = await hre.ethers.getContractFactory("LeverageSingleVault");
    //address _lendVault, address _router, address _quoterAddress, address _config, address _dev
    const leverageSingleVault = await LeverageSingleVault.deploy(lendVault.address, UNI_V3_SWAP_ROUTER, UNI_V3_QUOTER_ADDRESS, projectConfig.address, OWNER_ADDRESS);
    await leverageSingleVault.deployed();
    console.log("LeverageSingleVault deployed to:", leverageSingleVault.address);


    // 借贷金库增加资产
    await lendVault.addBank(WETH_ADDRESS, 1, "iWETH", "iWETH");
    await lendVault.addBank(USDC_ADDRESS, 1, "iUSDC", "iUSDC");
    await lendVault.addBank(LOOKS_ADDRESS, 2, "iLOOKS", "iLOOKS");
    console.log("lend vault add bank success");

    // 借贷金库把杠杆金库加入白名单
    await lendVault.setDebtor(leveragePairVault.address, true);
    await lendVault.setDebtor(leverageSingleVault.address, true);
    console.log("leverage vault set debtor success");

    // 杠杆双币金库增加借贷挖矿池
    await leveragePairVault.addPool(100, UNIVERSE_POOL_WETH_LOOKS, 6000, 9000);
    console.log("leverage pair vault add pool success");

    // 杠杆单币金库增加借贷挖矿池
    // 最大价差/10000，是否池子token0，池子地址，开仓借贷占比/10000，强平借贷占比/10000
    await leverageSingleVault.addPool(100, true, UNIVERSE_POOL_USDC_WETH, 6000, 9000);
    await leverageSingleVault.addPool(100, false, UNIVERSE_POOL_USDC_WETH, 6000, 9000)
    console.log("leverage single vault add pool success");

    // 金库owner转移至测试账号
    await projectConfig.transferOwnership(OWNER_ADDRESS);
    await lendVault.transferOwnership(OWNER_ADDRESS);
    await leveragePairVault.transferOwnership(OWNER_ADDRESS);
    await leverageSingleVault.transferOwnership(OWNER_ADDRESS);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });