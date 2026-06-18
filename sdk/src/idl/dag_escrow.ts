/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/dag_escrow.json`.
 */
export type DagEscrow = {
  "address": "3FqvkzppD4ciwkGLrcNoTHUCeHwNbWtot18CkrBdXiJd",
  "metadata": {
    "name": "dagEscrow",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "cancelPipeline",
      "docs": [
        "Consumer cancels a pipeline that has no claimed/settled nodes, recovering",
        "the full vault. Node accounts (remaining_accounts) are closed to consumer."
      ],
      "discriminator": [
        183,
        254,
        33,
        72,
        36,
        118,
        101,
        58
      ],
      "accounts": [
        {
          "name": "pipeline",
          "writable": true
        },
        {
          "name": "consumer",
          "writable": true,
          "signer": true,
          "relations": [
            "pipeline"
          ]
        },
        {
          "name": "stakeMint"
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "pipeline"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "stakeMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "consumerTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "consumer"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "stakeMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "claimNode",
      "docs": [
        "An agent claims a node once all dependencies are settled and its tier is",
        "sufficient. CPIs into bonded_registry to increment the open-job counter."
      ],
      "discriminator": [
        174,
        6,
        2,
        112,
        101,
        127,
        211,
        53
      ],
      "accounts": [
        {
          "name": "pipelineConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  105,
                  112,
                  101,
                  108,
                  105,
                  110,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pipeline",
          "writable": true
        },
        {
          "name": "node",
          "writable": true
        },
        {
          "name": "agent",
          "signer": true
        },
        {
          "name": "agentStake",
          "writable": true
        },
        {
          "name": "registryConfig"
        },
        {
          "name": "dagAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  97,
                  103,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "bondedRegistryProgram",
          "address": "26AB6S5crQAkhfx928bnWSHfpQE6wp2Sdt4afFtk7crq"
        }
      ],
      "args": [
        {
          "name": "nodeIndex",
          "type": "u8"
        }
      ]
    },
    {
      "name": "completeNode",
      "docs": [
        "Facilitator settles a claimed node: pays the agent (minus fee), pays the",
        "operator fee, decrements the open-job counter, and writes reputation."
      ],
      "discriminator": [
        21,
        239,
        8,
        243,
        214,
        77,
        140,
        38
      ],
      "accounts": [
        {
          "name": "pipelineConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  105,
                  112,
                  101,
                  108,
                  105,
                  110,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pipeline",
          "writable": true
        },
        {
          "name": "node",
          "writable": true
        },
        {
          "name": "facilitator",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "pipeline"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "stakeMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "stakeMint"
        },
        {
          "name": "agent"
        },
        {
          "name": "agentTokenAccount",
          "writable": true
        },
        {
          "name": "operatorTreasury",
          "writable": true
        },
        {
          "name": "dagAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  97,
                  103,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "registryConfig",
          "writable": true
        },
        {
          "name": "agentStake",
          "writable": true
        },
        {
          "name": "bondedRegistryProgram",
          "address": "26AB6S5crQAkhfx928bnWSHfpQE6wp2Sdt4afFtk7crq"
        },
        {
          "name": "bridgeConfig",
          "writable": true
        },
        {
          "name": "agentReputation",
          "writable": true
        },
        {
          "name": "jobRecord",
          "writable": true
        },
        {
          "name": "reputationBridgeProgram",
          "address": "6RRfs1Ho1bJ3JWXSy3xVth4BTGHWwVwum74ph2LRWWsf"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "nodeIndex",
          "type": "u8"
        },
        {
          "name": "scoreDelta",
          "type": "i16"
        }
      ]
    },
    {
      "name": "createPipeline",
      "docs": [
        "Create a DAG pipeline, lock the full budget into a vault, and create one",
        "PipelineNode account per node (passed as remaining_accounts in order)."
      ],
      "discriminator": [
        2,
        163,
        168,
        112,
        105,
        112,
        10,
        96
      ],
      "accounts": [
        {
          "name": "pipeline",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  105,
                  112,
                  101,
                  108,
                  105,
                  110,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "consumer"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "consumer",
          "writable": true,
          "signer": true
        },
        {
          "name": "stakeMint"
        },
        {
          "name": "consumerTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "consumer"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "stakeMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "pipeline"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "stakeMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "nodeConfigs",
          "type": {
            "vec": {
              "defined": {
                "name": "nodeConfig"
              }
            }
          }
        },
        {
          "name": "nonce",
          "type": "u64"
        }
      ]
    },
    {
      "name": "expireNode",
      "docs": [
        "Permissionless expiry of an overdue node. Cascades expiry to all",
        "downstream (still-pending) nodes and refunds the consumer in one tx.",
        "If the target node was claimed, slashes its agent and records a failure."
      ],
      "discriminator": [
        78,
        77,
        194,
        111,
        100,
        41,
        18,
        81
      ],
      "accounts": [
        {
          "name": "pipelineConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  105,
                  112,
                  101,
                  108,
                  105,
                  110,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pipeline",
          "writable": true
        },
        {
          "name": "node",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "pipeline"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "stakeMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "stakeMint"
        },
        {
          "name": "consumerTokenAccount",
          "writable": true
        },
        {
          "name": "caller",
          "writable": true,
          "signer": true
        },
        {
          "name": "dagAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  97,
                  103,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "registryConfig",
          "writable": true,
          "optional": true
        },
        {
          "name": "agentStake",
          "writable": true,
          "optional": true
        },
        {
          "name": "agentStakeVault",
          "writable": true,
          "optional": true
        },
        {
          "name": "bondedRegistryProgram",
          "optional": true,
          "address": "26AB6S5crQAkhfx928bnWSHfpQE6wp2Sdt4afFtk7crq"
        },
        {
          "name": "bridgeConfig",
          "writable": true,
          "optional": true
        },
        {
          "name": "agentReputation",
          "writable": true,
          "optional": true
        },
        {
          "name": "jobRecord",
          "writable": true,
          "optional": true
        },
        {
          "name": "agent",
          "optional": true
        },
        {
          "name": "reputationBridgeProgram",
          "optional": true,
          "address": "6RRfs1Ho1bJ3JWXSy3xVth4BTGHWwVwum74ph2LRWWsf"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "nodeIndex",
          "type": "u8"
        }
      ]
    },
    {
      "name": "initialize",
      "docs": [
        "One-time operator setup. Stores the fee, the facilitator authority",
        "(permitted to settle nodes) and the canonical dag_authority PDA bump."
      ],
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "pipelineConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  105,
                  112,
                  101,
                  108,
                  105,
                  110,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "operator",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "feeBps",
          "type": "u16"
        },
        {
          "name": "facilitatorAuthority",
          "type": "pubkey"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "agentStake",
      "discriminator": [
        47,
        68,
        130,
        227,
        185,
        4,
        183,
        36
      ]
    },
    {
      "name": "pipeline",
      "discriminator": [
        30,
        82,
        16,
        218,
        196,
        77,
        115,
        224
      ]
    },
    {
      "name": "pipelineConfig",
      "discriminator": [
        82,
        0,
        165,
        26,
        38,
        212,
        212,
        44
      ]
    },
    {
      "name": "pipelineNode",
      "discriminator": [
        235,
        28,
        28,
        46,
        101,
        113,
        181,
        161
      ]
    },
    {
      "name": "registryConfig",
      "discriminator": [
        23,
        118,
        10,
        246,
        173,
        231,
        243,
        156
      ]
    }
  ],
  "events": [
    {
      "name": "nodeClaimed",
      "discriminator": [
        242,
        185,
        53,
        19,
        17,
        105,
        132,
        177
      ]
    },
    {
      "name": "nodeExpired",
      "discriminator": [
        75,
        227,
        154,
        33,
        140,
        82,
        129,
        156
      ]
    },
    {
      "name": "nodeSettled",
      "discriminator": [
        163,
        173,
        13,
        69,
        159,
        11,
        66,
        26
      ]
    },
    {
      "name": "pipelineCancelled",
      "discriminator": [
        232,
        3,
        54,
        70,
        49,
        138,
        214,
        63
      ]
    },
    {
      "name": "pipelineCreated",
      "discriminator": [
        131,
        255,
        216,
        35,
        51,
        51,
        137,
        139
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidFeeBps",
      "msg": "Fee BPS exceeds 100%"
    },
    {
      "code": 6001,
      "name": "invalidNodeCount",
      "msg": "Node count must be between 1 and 16"
    },
    {
      "code": 6002,
      "name": "nodeAccountMismatch",
      "msg": "Number of node accounts does not match node configs"
    },
    {
      "code": 6003,
      "name": "invalidDag",
      "msg": "Dependency graph contains a cycle or forward edge"
    },
    {
      "code": 6004,
      "name": "emptyPipeline",
      "msg": "Pipeline allocation must be greater than zero"
    },
    {
      "code": 6005,
      "name": "invalidNodeAccount",
      "msg": "Provided node account does not match expected PDA"
    },
    {
      "code": 6006,
      "name": "pipelineNotActive",
      "msg": "Pipeline is not active"
    },
    {
      "code": 6007,
      "name": "nodeNotClaimable",
      "msg": "Node is not in a claimable state"
    },
    {
      "code": 6008,
      "name": "dependenciesNotMet",
      "msg": "Node dependencies are not all settled"
    },
    {
      "code": 6009,
      "name": "agentMismatch",
      "msg": "Agent does not match the stake account"
    },
    {
      "code": 6010,
      "name": "tierInsufficient",
      "msg": "Agent tier is insufficient for this node"
    },
    {
      "code": 6011,
      "name": "unauthorizedFacilitator",
      "msg": "Caller is not the configured facilitator"
    },
    {
      "code": 6012,
      "name": "nodeNotClaimed",
      "msg": "Node is not claimed"
    },
    {
      "code": 6013,
      "name": "nodeNotExpirable",
      "msg": "Node cannot be expired in its current state"
    },
    {
      "code": 6014,
      "name": "deadlineNotPassed",
      "msg": "Node deadline has not passed"
    },
    {
      "code": 6015,
      "name": "missingSlashAccounts",
      "msg": "Missing accounts required to slash a claimed node"
    },
    {
      "code": 6016,
      "name": "invalidTreasury",
      "msg": "Operator treasury account has wrong owner"
    },
    {
      "code": 6017,
      "name": "invalidConsumerAccount",
      "msg": "Consumer token account has wrong owner"
    },
    {
      "code": 6018,
      "name": "pipelineHasActivity",
      "msg": "Pipeline has claimed or settled nodes"
    },
    {
      "code": 6019,
      "name": "mathOverflow",
      "msg": "Math overflow"
    }
  ],
  "types": [
    {
      "name": "agentStake",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "stakeMint",
            "type": "pubkey"
          },
          {
            "name": "stakeAmount",
            "type": "u64"
          },
          {
            "name": "tier",
            "type": "u8"
          },
          {
            "name": "openJobs",
            "type": "u32"
          },
          {
            "name": "totalSettled",
            "type": "u32"
          },
          {
            "name": "totalSlashed",
            "type": "u32"
          },
          {
            "name": "unstakeRequestedAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "nodeClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pipeline",
            "type": "pubkey"
          },
          {
            "name": "nodeIndex",
            "type": "u8"
          },
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "jobId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "nodeConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "allocationUsdc",
            "type": "u64"
          },
          {
            "name": "deadlineSlotsFromNow",
            "type": "u64"
          },
          {
            "name": "dependencyMask",
            "type": "u64"
          },
          {
            "name": "requiredTier",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "nodeExpired",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pipeline",
            "type": "pubkey"
          },
          {
            "name": "nodeIndex",
            "type": "u8"
          },
          {
            "name": "refundAmount",
            "type": "u64"
          },
          {
            "name": "slashed",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "nodeSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pipeline",
            "type": "pubkey"
          },
          {
            "name": "nodeIndex",
            "type": "u8"
          },
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "paid",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "nodeStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pending"
          },
          {
            "name": "claimed"
          },
          {
            "name": "settled"
          },
          {
            "name": "expired"
          }
        ]
      }
    },
    {
      "name": "pipeline",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "consumer",
            "type": "pubkey"
          },
          {
            "name": "totalNodes",
            "type": "u8"
          },
          {
            "name": "totalUsdcLocked",
            "type": "u64"
          },
          {
            "name": "nodesSettled",
            "type": "u8"
          },
          {
            "name": "nodesExpired",
            "type": "u8"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "pipelineStatus"
              }
            }
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "stakeMint",
            "type": "pubkey"
          },
          {
            "name": "settledMask",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "pipelineCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pipeline",
            "type": "pubkey"
          },
          {
            "name": "refundAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "pipelineConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "operator",
            "type": "pubkey"
          },
          {
            "name": "facilitatorAuthority",
            "type": "pubkey"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "dagAuthorityBump",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "pipelineCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pipeline",
            "type": "pubkey"
          },
          {
            "name": "consumer",
            "type": "pubkey"
          },
          {
            "name": "totalNodes",
            "type": "u8"
          },
          {
            "name": "totalUsdcLocked",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "pipelineNode",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pipeline",
            "type": "pubkey"
          },
          {
            "name": "nodeIndex",
            "type": "u8"
          },
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "allocationUsdc",
            "type": "u64"
          },
          {
            "name": "deadlineSlot",
            "type": "u64"
          },
          {
            "name": "dependencyMask",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "nodeStatus"
              }
            }
          },
          {
            "name": "settledAtSlot",
            "type": "u64"
          },
          {
            "name": "jobId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "requiredTier",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "pipelineStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "completed"
          },
          {
            "name": "partiallyRefunded"
          },
          {
            "name": "cancelled"
          }
        ]
      }
    },
    {
      "name": "registryConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "operator",
            "type": "pubkey"
          },
          {
            "name": "dagEscrowAuthority",
            "type": "pubkey"
          },
          {
            "name": "slashBps",
            "type": "u16"
          },
          {
            "name": "cooldownSlots",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
