// We require the Hardhat Runtime Environment explicitly here. This is optional 
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const fs = require('fs');
const { address } = require("../test/helpers/constants");
const { Wallet } = require("ethers");
const { UV_FS_O_FILEMAP } = require("constants");
const ethers = hre.ethers;
require('dotenv').config()
const shouldDeployV4 = true
const shouldDeployV3 = false
let shouldDeployOceanMock = false
const shouldDeployOPFCommunity = true
const logging = true
async function main() {
  const url = process.env.NETWORK_RPC_URL;
  if (!url) {
    console.error("Missing NETWORK_RPC_URL. Aborting..");
    return null;
  }
  const provider = new ethers.providers.JsonRpcProvider(url);
  const network = provider.getNetwork()
  let wallet
  if (process.env.MNEMONIC)
    wallet = new Wallet.fromMnemonic(process.env.MNEMONIC)
  if (process.env.PRIVATE_KEY)
    wallet = new Wallet(process.env.PRIVATE_KEY)
  if (!wallet) {
    console.error("Missing MNEMONIC or PRIVATE_KEY. Aborting..");
    return null;
  }
  owner = wallet.connect(provider);
  console.log(owner)
  let oceanAddress
  let communityCollector
  let OPFOwner
  let balancerV1Factory = null
  switch (network.chainId) {
    default:
      oceanAddress = "0x967da4048cd07ab37855c090aaf366e4ce1b9f48";
      OPFOwner = '0x7DF5273aD9A6fCce64D45c64c1E43cfb6F861725';
      networkName = 'development';
      shouldDeployOceanMock = true;
      break;
  }

  const addressFile = process.env.ADDRESS_FILE
  let oldAddresses
  if (addressFile) {
    try {
      oldAddresses = JSON.parse(fs.readFileSync(addressFile))
    } catch (e) {
      console.log(e)
      oldAddresses = {}
    }
    if (!oldAddresses[networkName])
      oldAddresses[networkName] = {}
    addresses = oldAddresses[networkName]
  }
  if (logging)
    console.info("Use existing addresses:" + JSON.stringify(addresses, null, 2))

  // utils
  const networkDetails = await network
  addresses.chainId = networkDetails.chainId
  if (shouldDeployOceanMock) {
    if (logging) console.info("Deploying OceanMock")
    const Ocean = await ethers.getContractFactory('MockOcean', owner)
    const ocean = await Ocean.connect(owner).deploy(owner.address)
    addresses.Ocean = ocean.address
  }
  if (logging) console.info("Deploying OPF Community Fee")
  const OPFCommunityFeeCollector = await ethers.getContractFactory("OPFCommunityFeeCollector", owner)
  const opfcommunityfeecollector = await OPFCommunityFeeCollector.deploy(OPFOwner, OPFOwner)
  addresses.OPFCommunityFeeCollector = opfcommunityfeecollector.address


  if (logging) console.info("Deploying V4 contracts")
  // v4 contracts
  const FixedPriceExchange = await ethers.getContractFactory(
    "FixedRateExchange"
  );

  const ERC721Template = await ethers.getContractFactory("ERC721Template");
  const ERC20Template = await ethers.getContractFactory("ERC20Template");
  const ERC721Factory = await ethers.getContractFactory("ERC721Factory");

  const Router = await ethers.getContractFactory("FactoryRouter");
  const SSContract = await ethers.getContractFactory("SideStaking");
  const BPool = await ethers.getContractFactory("BPool");
  const Dispenser = await ethers.getContractFactory("Dispenser");

  const poolTemplate = await BPool.deploy();

  // DEPLOY ROUTER, SETTING OWNER

  if (logging) console.log('Deploying Router')
  const router = await Router.deploy(
    owner.address,
    oceanAddress,
    poolTemplate.address,
    addresses.OPFCommunityFeeCollector,
    []
  );
  if (logging) console.info("Deploying FixedPriceExchange")
  const fixedPriceExchange = await FixedPriceExchange.deploy(
    router.address,
    addresses.OPFCommunityFeeCollector
  );
  if (logging) console.info("Deploying StakingContract")
  const ssPool = await SSContract.deploy(router.address);
  if (logging) console.info("Deploying ERC20 Template")
  const templateERC20 = await ERC20Template.deploy();
  if (logging) console.info("Deploying Dispenser")
  const dispenser = await Dispenser.deploy(
    router.address,
    addresses.OPFCommunityFeeCollector
  );
  if (logging) console.info("Deploying ERC721 Template")
  const templateERC721 = await ERC721Template.deploy();

  if (logging) console.info("Deploying ERC721 Factory")
  const factoryERC721 = await ERC721Factory.deploy(
    templateERC721.address,
    templateERC20.address,
    addresses.OPFCommunityFeeCollector,
    router.address
  );

  // SET REQUIRED ADDRESS

  if (logging) console.info("Adding factoryERC721.address")  
  await router.connect(owner).addFactory(factoryERC721.address);
  if (logging) console.info("Adding fixedPriceExchange.address")  
  await router.connect(owner).addFixedRateContract(fixedPriceExchange.address);
  if (logging) console.info("Adding dispenser.address")  
  await router.connect(owner).addFixedRateContract(dispenser.address);
  if (logging) console.info("Adding ssPool.address")  
  await router.connect(owner).addSSContract(ssPool.address)
  if (logging) console.info("Moving Router ownership")  
  await router.connect(owner).changeRouterOwner(OPFOwner)

  addresses.ERC721Factory = factoryERC721.address
  addresses.ERC20Template = templateERC20.address
  addresses.ERC721Template = templateERC721.address
  addresses.Router = router.address
  addresses.FixedPrice = fixedPriceExchange.address
  addresses.Staking = ssPool.address
  addresses.poolTemplate = poolTemplate.address

  if (addressFile) {
    // write address.json if needed
    oldAddresses[networkName] = addresses
    if (logging) console.info('writing to ' + addressFile + '\r\n' + JSON.stringify(oldAddresses, null, 2))
    try {
      fs.writeFileSync(addressFile, JSON.stringify(oldAddresses, null, 2))
    } catch (e) {
      console.error(e)
    }
  }

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });