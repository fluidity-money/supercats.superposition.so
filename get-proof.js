#!/usr/bin/env -S node

import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import fs from "fs";

// (1)
const tree = StandardMerkleTree.load(JSON.parse(fs.readFileSync("tree.json", "utf8")));

var items = [];

for (const [i, v] of tree.entries()) {
  const proof = tree.getProof(i);
  items.push({
    "token_id": v[0],
    "owner": v[1],
    "proof": proof
  });
}

fs.writeFileSync("proofs.json", JSON.stringify(items));
