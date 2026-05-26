import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ViolationRegistryModule = buildModule("ViolationRegistryModule", (m) => {
  const registry = m.contract("ViolationRegistry");
  return { registry };
});

export default ViolationRegistryModule;
