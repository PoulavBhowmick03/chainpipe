/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/reputation_bridge.json`.
 */
export type ReputationBridge = {
  "address": "6RRfs1Ho1bJ3JWXSy3xVth4BTGHWwVwum74ph2LRWWsf",
  "metadata": {
    "name": "reputationBridge",
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
          "name": "bridgeConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  114,
                  105,
                  100,
                  103,
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
          "name": "newOperator",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "initialize",
      "docs": [
        "One-time operator setup. `dag_escrow_authority` is the dag_escrow CPI",
        "signer PDA permitted to write reputation; `dag_escrow_program` is stored",
        "for reference / future ATOM upgrade path."
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
          "name": "bridgeConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  114,
                  105,
                  100,
                  103,
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
          "name": "dagEscrowProgram",
          "type": "pubkey"
        },
        {
          "name": "dagEscrowAuthority",
          "type": "pubkey"
        },
        {
          "name": "emaAlphaBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "migrateBridgeConfig",
      "docs": [
        "One-time migration: grow a pre-hardening BridgeConfig and seed new fields."
      ],
      "discriminator": [
        58,
        20,
        134,
        143,
        54,
        144,
        190,
        179
      ],
      "accounts": [
        {
          "name": "bridgeConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  114,
                  105,
                  100,
                  103,
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
          "signer": true,
          "relations": [
            "bridgeConfig"
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
          "name": "bridgeConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  114,
                  105,
                  100,
                  103,
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
          "signer": true,
          "relations": [
            "bridgeConfig"
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
      "name": "recordCompletion",
      "docs": [
        "Record a settled job. Callable only by the dag_escrow authority PDA."
      ],
      "discriminator": [
        209,
        113,
        91,
        75,
        66,
        137,
        244,
        157
      ],
      "accounts": [
        {
          "name": "bridgeConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  114,
                  105,
                  100,
                  103,
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
          "name": "agentReputation",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  112,
                  117,
                  116,
                  97,
                  116,
                  105,
                  111,
                  110
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
          "name": "jobRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  111,
                  98,
                  95,
                  114,
                  101,
                  99,
                  111,
                  114,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "jobId"
              }
            ]
          }
        },
        {
          "name": "agent"
        },
        {
          "name": "dagAuthority",
          "docs": [
            "dag_escrow CPI signer PDA — verified against bridge_config."
          ],
          "signer": true
        },
        {
          "name": "payer",
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
          "name": "jobId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "scoreDelta",
          "type": "i16"
        }
      ]
    },
    {
      "name": "recordFailure",
      "docs": [
        "Record a failed job. Callable only by the dag_escrow authority PDA."
      ],
      "discriminator": [
        86,
        94,
        231,
        2,
        95,
        43,
        53,
        161
      ],
      "accounts": [
        {
          "name": "bridgeConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  114,
                  105,
                  100,
                  103,
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
          "name": "agentReputation",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  112,
                  117,
                  116,
                  97,
                  116,
                  105,
                  111,
                  110
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
          "name": "jobRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  111,
                  98,
                  95,
                  114,
                  101,
                  99,
                  111,
                  114,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "jobId"
              }
            ]
          }
        },
        {
          "name": "agent"
        },
        {
          "name": "dagAuthority",
          "docs": [
            "dag_escrow CPI signer PDA — verified against bridge_config."
          ],
          "signer": true
        },
        {
          "name": "payer",
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
          "name": "jobId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
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
          "name": "bridgeConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  114,
                  105,
                  100,
                  103,
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
          "signer": true,
          "relations": [
            "bridgeConfig"
          ]
        }
      ],
      "args": [
        {
          "name": "dagEscrowAuthority",
          "type": "pubkey"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "agentReputation",
      "discriminator": [
        245,
        56,
        239,
        246,
        36,
        231,
        227,
        67
      ]
    },
    {
      "name": "bridgeConfig",
      "discriminator": [
        40,
        206,
        51,
        233,
        246,
        40,
        178,
        85
      ]
    },
    {
      "name": "jobRecord",
      "discriminator": [
        220,
        194,
        212,
        58,
        47,
        65,
        141,
        196
      ]
    }
  ],
  "events": [
    {
      "name": "reputationPenalized",
      "discriminator": [
        200,
        212,
        62,
        129,
        1,
        143,
        228,
        214
      ]
    },
    {
      "name": "reputationUpdated",
      "discriminator": [
        26,
        36,
        187,
        150,
        235,
        90,
        106,
        89
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorizedCaller",
      "msg": "Unauthorized: caller is not the dag_escrow authority"
    },
    {
      "code": 6001,
      "name": "invalidAlpha",
      "msg": "EMA alpha bps exceeds 100%"
    },
    {
      "code": 6002,
      "name": "noPendingOperator",
      "msg": "No pending operator to accept"
    },
    {
      "code": 6003,
      "name": "notPendingOperator",
      "msg": "Signer is not the pending operator"
    },
    {
      "code": 6004,
      "name": "alreadyMigrated",
      "msg": "Config already migrated"
    }
  ],
  "types": [
    {
      "name": "agentReputation",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "emaScore",
            "type": "u32"
          },
          {
            "name": "totalSettled",
            "type": "u32"
          },
          {
            "name": "totalFailed",
            "type": "u32"
          },
          {
            "name": "lastJobId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "lastUpdatedSlot",
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
      "name": "bridgeConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "operator",
            "type": "pubkey"
          },
          {
            "name": "dagEscrowProgram",
            "type": "pubkey"
          },
          {
            "name": "dagEscrowAuthority",
            "type": "pubkey"
          },
          {
            "name": "emaAlphaBps",
            "type": "u16"
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
            "name": "pendingOperator",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "jobOutcome",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "settled"
          },
          {
            "name": "failed"
          }
        ]
      }
    },
    {
      "name": "jobRecord",
      "type": {
        "kind": "struct",
        "fields": [
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
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "outcome",
            "type": {
              "defined": {
                "name": "jobOutcome"
              }
            }
          },
          {
            "name": "scoreDelta",
            "type": "i16"
          },
          {
            "name": "recordedAtSlot",
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
      "name": "reputationPenalized",
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
            "name": "emaScore",
            "type": "u32"
          },
          {
            "name": "totalFailed",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "reputationUpdated",
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
            "name": "emaScore",
            "type": "u32"
          },
          {
            "name": "totalSettled",
            "type": "u32"
          }
        ]
      }
    }
  ]
};
