/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/bonded_registry.json`.
 */
export type BondedRegistry = {
  "address": "26AB6S5crQAkhfx928bnWSHfpQE6wp2Sdt4afFtk7crq",
  "metadata": {
    "name": "bondedRegistry",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "acceptOperator",
      "discriminator": [
        216,
        185,
        116,
        130,
        254,
        55,
        57,
        128
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "name": "newOperator",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "addStake",
      "docs": [
        "Add to an existing stake (may upgrade the tier)."
      ],
      "discriminator": [
        58,
        135,
        189,
        105,
        160,
        120,
        165,
        224
      ],
      "accounts": [
        {
          "name": "agentStake",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116,
                  95,
                  115,
                  116,
                  97,
                  107,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "agent"
              }
            ]
          }
        },
        {
          "name": "agent",
          "writable": true,
          "signer": true,
          "relations": [
            "agentStake"
          ]
        },
        {
          "name": "stakeMint"
        },
        {
          "name": "agentTokenAccount",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "agentStake"
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
      "args": [
        {
          "name": "additionalAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "decrementOpenJobs",
      "docs": [
        "Decrement the open-job counter and tally a settlement (called by",
        "dag_escrow on settle or expire). `settled` distinguishes the two."
      ],
      "discriminator": [
        102,
        87,
        23,
        60,
        84,
        103,
        207,
        205
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "name": "agentStake",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116,
                  95,
                  115,
                  116,
                  97,
                  107,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "agent_stake.agent",
                "account": "agentStake"
              }
            ]
          }
        },
        {
          "name": "dagAuthority",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "settled",
          "type": "bool"
        }
      ]
    },
    {
      "name": "executeUnstake",
      "docs": [
        "Withdraw the full stake after the cooldown elapses."
      ],
      "discriminator": [
        136,
        166,
        210,
        104,
        134,
        184,
        142,
        230
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "name": "agentStake",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116,
                  95,
                  115,
                  116,
                  97,
                  107,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "agent"
              }
            ]
          }
        },
        {
          "name": "agent",
          "writable": true,
          "signer": true,
          "relations": [
            "agentStake"
          ]
        },
        {
          "name": "stakeMint",
          "relations": [
            "agentStake"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "agentStake"
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
          "name": "agentTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "agent"
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
      "name": "incrementOpenJobs",
      "docs": [
        "Increment the open-job counter (called by dag_escrow on claim)."
      ],
      "discriminator": [
        252,
        155,
        47,
        55,
        77,
        167,
        194,
        110
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "name": "agentStake",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116,
                  95,
                  115,
                  116,
                  97,
                  107,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "agent_stake.agent",
                "account": "agentStake"
              }
            ]
          }
        },
        {
          "name": "dagAuthority",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "initialize",
      "docs": [
        "One-time operator setup of the registry config PDA."
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
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "name": "slashBps",
          "type": "u16"
        },
        {
          "name": "cooldownSlots",
          "type": "u64"
        },
        {
          "name": "dagEscrowAuthority",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "migrateRegistryConfig",
      "docs": [
        "One-time migration: grow a pre-hardening RegistryConfig and seed new fields."
      ],
      "discriminator": [
        103,
        181,
        226,
        54,
        185,
        93,
        44,
        69
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "proposeOperator",
      "docs": [
        "Two-step operator transfer (propose; successor must accept)."
      ],
      "discriminator": [
        42,
        183,
        138,
        176,
        225,
        0,
        30,
        34
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "signer": true,
          "relations": [
            "config"
          ]
        }
      ],
      "args": [
        {
          "name": "newOperator",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "requestUnstake",
      "docs": [
        "Begin the unstake cooldown. Reverts if the agent has open jobs."
      ],
      "discriminator": [
        44,
        154,
        110,
        253,
        160,
        202,
        54,
        34
      ],
      "accounts": [
        {
          "name": "agentStake",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116,
                  95,
                  115,
                  116,
                  97,
                  107,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "agent"
              }
            ]
          }
        },
        {
          "name": "agent",
          "signer": true,
          "relations": [
            "agentStake"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "setDagEscrowAuthority",
      "docs": [
        "Operator may update the authorized dag_escrow CPI signer (its PDA)."
      ],
      "discriminator": [
        124,
        86,
        203,
        249,
        39,
        6,
        207,
        30
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "signer": true,
          "relations": [
            "config"
          ]
        }
      ],
      "args": [
        {
          "name": "dagEscrowAuthority",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setMaxSlashBps",
      "docs": [
        "Operator sets the per-incident slash ceiling (≤ 100%)."
      ],
      "discriminator": [
        98,
        130,
        145,
        120,
        194,
        117,
        96,
        202
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "signer": true,
          "relations": [
            "config"
          ]
        }
      ],
      "args": [
        {
          "name": "maxSlashBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "slashStake",
      "docs": [
        "Slash a fraction of an agent's stake to the consumer. Only the configured",
        "dag_escrow authority PDA may invoke this (enforced via signer check)."
      ],
      "discriminator": [
        190,
        242,
        137,
        27,
        41,
        18,
        233,
        37
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "name": "agentStake",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116,
                  95,
                  115,
                  116,
                  97,
                  107,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "agent_stake.agent",
                "account": "agentStake"
              }
            ]
          }
        },
        {
          "name": "stakeMint",
          "relations": [
            "agentStake"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "agentStake"
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
          "writable": true
        },
        {
          "name": "dagAuthority",
          "docs": [
            "CPI signer PDA derived from the dag_escrow program. Verified against",
            "config.dag_escrow_authority."
          ],
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
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
          "name": "slashBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "stakeAndRegister",
      "docs": [
        "Stake SPL tokens into a per-agent vault and register at the matching tier."
      ],
      "discriminator": [
        201,
        136,
        88,
        53,
        7,
        58,
        127,
        238
      ],
      "accounts": [
        {
          "name": "agentStake",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116,
                  95,
                  115,
                  116,
                  97,
                  107,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "agent"
              }
            ]
          }
        },
        {
          "name": "agent",
          "writable": true,
          "signer": true
        },
        {
          "name": "stakeMint"
        },
        {
          "name": "agentTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "agent"
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
                "path": "agentStake"
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
          "name": "stakeAmount",
          "type": "u64"
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
      "name": "stakeRegistered",
      "discriminator": [
        128,
        126,
        22,
        183,
        230,
        39,
        13,
        121
      ]
    },
    {
      "name": "stakeSlashed",
      "discriminator": [
        43,
        41,
        196,
        25,
        218,
        235,
        244,
        35
      ]
    },
    {
      "name": "stakeWithdrawn",
      "discriminator": [
        33,
        120,
        159,
        58,
        140,
        255,
        174,
        79
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "stakeTooLow",
      "msg": "Stake amount below minimum for any tier"
    },
    {
      "code": 6001,
      "name": "hasOpenJobs",
      "msg": "Agent has open jobs, cannot unstake"
    },
    {
      "code": 6002,
      "name": "cooldownNotElapsed",
      "msg": "Cooldown period not elapsed"
    },
    {
      "code": 6003,
      "name": "unstakeNotRequested",
      "msg": "Unstake not requested"
    },
    {
      "code": 6004,
      "name": "invalidSlashBps",
      "msg": "Slash BPS exceeds 100%"
    },
    {
      "code": 6005,
      "name": "unauthorizedCaller",
      "msg": "Unauthorized: caller is not dag_escrow program"
    },
    {
      "code": 6006,
      "name": "agentNotRegistered",
      "msg": "Agent is not registered"
    },
    {
      "code": 6007,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6008,
      "name": "slashExceedsCap",
      "msg": "Slash BPS exceeds the configured per-incident cap"
    },
    {
      "code": 6009,
      "name": "noPendingOperator",
      "msg": "No pending operator to accept"
    },
    {
      "code": 6010,
      "name": "notPendingOperator",
      "msg": "Signer is not the pending operator"
    },
    {
      "code": 6011,
      "name": "alreadyMigrated",
      "msg": "Config already migrated"
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
          },
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "maxSlashBps",
            "docs": [
              "Hard ceiling on any single slash (per incident), caller-independent."
            ],
            "type": "u16"
          },
          {
            "name": "pendingOperator",
            "docs": [
              "Two-step operator transfer target (default = none)."
            ],
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "stakeRegistered",
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
          }
        ]
      }
    },
    {
      "name": "stakeSlashed",
      "type": {
        "kind": "struct",
        "fields": [
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
          },
          {
            "name": "slashAmount",
            "type": "u64"
          },
          {
            "name": "newTier",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "stakeWithdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
