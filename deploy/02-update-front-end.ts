import { ethers } from "hardhat";

import fs from "fs";
import { network } from "hardhat";
import { frontEndAbiFile, frontEndContractsFile } from "../helper-hardhat-config";

module.exports = async () => {
    console.log("Writing to front end...");
    await updateContractAddresses();
    await updateAbi();
    console.log("Front end written!");
};

async function updateAbi() {
  const raffle = await ethers.getContractAt("Raffle", "0x2caaE6084519aF089a2D66204da16402D65642f6");
  fs.writeFileSync(frontEndAbiFile, raffle.interface.formatJson());
}

async function updateContractAddresses() {
  const raffle = await ethers.getContractAt("Raffle", "0x2caaE6084519aF089a2D66204da16402D65642f6");
  const contractAddresses = JSON.parse(fs.readFileSync(frontEndContractsFile, "utf8"));
  if ((network?.config?.chainId as any).toString() in contractAddresses) {
    if (
      !contractAddresses[(network?.config?.chainId as any).toString()].includes(
        await raffle.getAddress()
      )
    ) {
      contractAddresses[(network.config.chainId as any).toString()] = await raffle.getAddress();
    }
  } else {
    contractAddresses[(network.config.chainId as any).toString()] = [await raffle.getAddress()];
  }
  fs.writeFileSync(frontEndContractsFile, JSON.stringify(contractAddresses));
}
module.exports.tags = ["all", "frontend"];
