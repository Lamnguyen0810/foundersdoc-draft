/**
 * The term sheet questionnaire (v1.0): the questions, in order, with their show/hide conditions, options by deal type and defaults.
 *
 * Generated from the firm's questionnaire.json — data, not code. Edit the source file and regenerate;
 * do not hand-edit here.
 */
export const QUESTIONNAIRE = {
  "id": "FD_TS_QUESTIONNAIRE",
  "version": "1.0",
  "for_master": "FD_TS_TRANSACTION v3.1",
  "status": "Draft for FD review",
  "intro_ref": "FD_TS_INTRO",
  "conventions": {
    "variants": "*_by_deal_type / variants are keyed by the Q1 answer; \"default\" applies to deal types not listed. Labels may contain {party_1_role} / {party_2_role}.",
    "show_if": "Condition language: {\"q\": id, \"eq\": v} | {\"q\": id, \"in\": [..]} | {\"q\": id, \"not_in\": [..]} | {\"all\": [..]} | {\"any\": [..]}. Hidden questions are skipped and their answer is null.",
    "default": "A literal value, or {\"rule\": [...]} evaluated top to bottom ({\"when\": cond, \"value\": v} ... {\"else\": v}), or a plain-English rule for the back end.",
    "other": "allow_other = the user can type their own answer. Typed answers are passed to the AI and flagged for lawyer review.",
    "periods": "ISO 8601 durations (P14D = 14 days, P3M = 3 months). allow_date = user may pick a calendar date instead.",
    "not_collected": "Party details (names, registration numbers, addresses, contact) come from the user account or a company registry lookup. If unavailable, insert a Parties step before Q3."
  },
  "deal_types": [
    "investment",
    "loan",
    "acquisition",
    "project",
    "other"
  ],
  "questions": [
    {
      "id": "Q1",
      "key": "deal_type",
      "section": "Set-up",
      "type": "single_choice",
      "allow_other": true,
      "other_label": "Other (please type)",
      "required": true,
      "text": "What is this term sheet for?",
      "help": "This decides which questions we ask next. Pick the closest match.",
      "options": [
        {
          "value": "investment",
          "label": "Investing in a company, or raising money for one"
        },
        {
          "value": "loan",
          "label": "Lending or borrowing money"
        },
        {
          "value": "acquisition",
          "label": "Buying or selling a business or its assets"
        },
        {
          "value": "project",
          "label": "Working together on a project or partnership"
        }
      ],
      "other_maps_to": "other",
      "on_other": "AI classifies the typed answer into one of the deal types (or keeps \"other\") and asks the user to confirm."
    },
    {
      "id": "Q2",
      "key": "side",
      "section": "Set-up",
      "type": "single_choice",
      "allow_other": true,
      "other_label": "Other (please type)",
      "required": true,
      "text": "Which side are you on?",
      "help": "We use this to suggest terms that protect your side.",
      "options_by_deal_type": {
        "investment": [
          {
            "value": "issuer",
            "label": "I'm investing"
          },
          {
            "value": "recipient",
            "label": "My company is raising money"
          }
        ],
        "loan": [
          {
            "value": "issuer",
            "label": "I'm lending"
          },
          {
            "value": "recipient",
            "label": "I'm borrowing"
          }
        ],
        "acquisition": [
          {
            "value": "issuer",
            "label": "I'm buying"
          },
          {
            "value": "recipient",
            "label": "I'm selling"
          }
        ],
        "project": [
          {
            "value": "issuer",
            "label": "We're proposing the project"
          },
          {
            "value": "recipient",
            "label": "We've been invited to take part"
          }
        ],
        "other": [
          {
            "value": "issuer",
            "label": "We're sending the term sheet"
          },
          {
            "value": "recipient",
            "label": "We're receiving the term sheet"
          }
        ]
      },
      "on_other": "Treat as \"issuer\" unless the text says otherwise; flag for review."
    },
    {
      "id": "Q3",
      "key": "deal_summary",
      "section": "The deal",
      "type": "free_text",
      "required": true,
      "max_length": 300,
      "text": "In one sentence, what is the deal?",
      "placeholder_by_deal_type": {
        "investment": "e.g. ABC Ventures will invest US$2m in XYZ Pte. Ltd. for new preference shares",
        "loan": "e.g. ABC Capital will lend S$500,000 to XYZ Pte. Ltd. for 12 months",
        "acquisition": "e.g. ABC Group will buy all the shares in XYZ Ltd from its two founders",
        "project": "e.g. ABC and XYZ will jointly develop and sell a new payments app in Vietnam",
        "other": "Describe the deal in one sentence"
      },
      "consistency_check": "AI compares this answer with Q1. If they conflict, ask the user to confirm Q1 before continuing."
    },
    {
      "id": "Q4",
      "key": "subject",
      "section": "The deal",
      "type": "single_choice",
      "allow_other": true,
      "other_label": "Other (please type)",
      "required": true,
      "text_by_deal_type": {
        "investment": "What will the investor receive?",
        "loan": "What kind of loan is it?",
        "acquisition": "What is being bought?",
        "project": "What will the project involve?",
        "other": "What exactly is being issued, sold, lent or provided?"
      },
      "options_by_deal_type": {
        "investment": [
          {
            "value": "new_shares",
            "label": "New shares"
          },
          {
            "value": "existing_shares",
            "label": "Existing shares from a shareholder"
          },
          {
            "value": "safe",
            "label": "SAFE"
          },
          {
            "value": "convertible_note",
            "label": "Convertible note"
          }
        ],
        "loan": [
          {
            "value": "term_loan",
            "label": "A loan repaid over a fixed period"
          },
          {
            "value": "revolving",
            "label": "A credit line that can be drawn and repaid"
          },
          {
            "value": "convertible_loan",
            "label": "A loan that can convert into shares"
          },
          {
            "value": "shareholder_loan",
            "label": "A loan from a shareholder"
          }
        ],
        "acquisition": [
          {
            "value": "all_shares",
            "label": "All the shares in a company"
          },
          {
            "value": "some_shares",
            "label": "Some of the shares in a company"
          },
          {
            "value": "business",
            "label": "A business and its assets"
          },
          {
            "value": "specific_assets",
            "label": "Specific assets only"
          }
        ],
        "project": [
          {
            "value": "joint_development",
            "label": "Developing something together"
          },
          {
            "value": "joint_venture",
            "label": "Setting up a new joint company"
          },
          {
            "value": "distribution",
            "label": "Selling or representing the other party’s products or services"
          },
          {
            "value": "services",
            "label": "One party providing services to the other"
          }
        ],
        "other": []
      },
      "help": "If more than one applies, choose the main one and mention the rest in \"Any other key terms\"."
    },
    {
      "id": "Q5",
      "key": "agreements",
      "section": "The deal",
      "type": "multi_choice",
      "allow_other": true,
      "other_label": "Other (please type)",
      "required": true,
      "text": "Which agreements will be signed?",
      "help": "Not sure? Choose “Suggest for me” and we'll pick the usual ones.",
      "options_by_subject": {
        "new_shares": [
          "Subscription Agreement",
          "Shareholders' Agreement"
        ],
        "existing_shares": [
          "Share Purchase Agreement",
          "Shareholders' Agreement"
        ],
        "safe": [
          "SAFE"
        ],
        "convertible_note": [
          "Convertible Note Agreement"
        ],
        "term_loan": [
          "Facility Agreement",
          "Security Documents"
        ],
        "revolving": [
          "Facility Agreement",
          "Security Documents"
        ],
        "convertible_loan": [
          "Convertible Loan Agreement"
        ],
        "shareholder_loan": [
          "Loan Agreement"
        ],
        "all_shares": [
          "Share Purchase Agreement",
          "Disclosure Letter"
        ],
        "some_shares": [
          "Share Purchase Agreement",
          "Shareholders' Agreement"
        ],
        "business": [
          "Business Transfer Agreement"
        ],
        "specific_assets": [
          "Asset Purchase Agreement"
        ],
        "joint_development": [
          "Joint Development Agreement"
        ],
        "joint_venture": [
          "Joint Venture Agreement",
          "Shareholders' Agreement"
        ],
        "distribution": [
          "Distribution Agreement"
        ],
        "services": [
          "Services Agreement"
        ]
      },
      "extra_options": [
        {
          "value": "suggest",
          "label": "Not sure, suggest for me"
        }
      ],
      "default": {
        "rule": "all options_by_subject[Q4]"
      },
      "on_other": "Use typed agreement names as given (title case)."
    },
    {
      "id": "Q6a",
      "key": "acceptance_period",
      "section": "Timing",
      "type": "period_or_date",
      "required": true,
      "text": "How long does the other side have to accept?",
      "options": [
        {
          "value": "P7D",
          "label": "7 days"
        },
        {
          "value": "P14D",
          "label": "14 days",
          "recommended": true
        },
        {
          "value": "P30D",
          "label": "30 days"
        }
      ],
      "allow_date": true,
      "default": "P14D",
      "help": "Most term sheets give 14 days to accept."
    },
    {
      "id": "Q6b",
      "key": "long_stop",
      "section": "Timing",
      "type": "period_or_date",
      "required": true,
      "text": "If the deal isn't signed, when should the term sheet lapse?",
      "options": [
        {
          "value": "P1M",
          "label": "1 month"
        },
        {
          "value": "P3M",
          "label": "3 months",
          "recommended": true
        },
        {
          "value": "P6M",
          "label": "6 months"
        }
      ],
      "allow_date": true,
      "default": "P3M",
      "help": "After this date the term sheet, including any exclusivity, ends automatically."
    },
    {
      "id": "Q7a",
      "key": "governing_law",
      "section": "Law and disputes",
      "type": "country",
      "allow_other": true,
      "other_label": "Other (please type)",
      "required": true,
      "text": "Which country's law should apply?",
      "help": "Usually the country where the company (or the business being sold) is based. For the UK, choose England and Wales, Scotland or Northern Ireland.",
      "default": {
        "rule": "jurisdiction of the company / borrower / target, if known from party details"
      },
      "follow_up": {
        "id": "Q7a_state",
        "key": "governing_law_state",
        "show_if": {
          "q": "Q7a",
          "in": [
            "United States",
            "Australia",
            "Canada"
          ]
        },
        "type": "state_list",
        "required": true,
        "text": "Which state or province?",
        "help": "In these countries contract law is set at state or province level, e.g. New York, Delaware, New South Wales, Ontario."
      }
    },
    {
      "id": "Q7b",
      "key": "disputes",
      "section": "Law and disputes",
      "type": "single_choice",
      "allow_other": true,
      "other_label": "Other (please type)",
      "required": true,
      "text": "If there's a dispute, how should it be resolved?",
      "options": [
        {
          "value": "courts",
          "label": "Courts of that country"
        },
        {
          "value": "arbitration",
          "label": "Arbitration"
        },
        {
          "value": "recommend",
          "label": "Not sure, recommend for me"
        }
      ],
      "default": {
        "rule": "courts if all parties are in the governing-law country; otherwise arbitration"
      },
      "help": "Arbitration is often used when the parties are in different countries, because awards can be enforced in most countries."
    },
    {
      "id": "Q8a",
      "key": "numbers_agreed",
      "section": "Key terms",
      "type": "single_choice",
      "required": true,
      "text_by_deal_type": {
        "project": "Have you agreed who contributes what?",
        "default": "Have you agreed the main numbers?"
      },
      "options": [
        {
          "value": "yes",
          "label": "Yes"
        },
        {
          "value": "partly",
          "label": "Partly"
        },
        {
          "value": "no",
          "label": "Not yet"
        }
      ],
      "help": "If not, we leave the key terms out and the term sheet covers the basics only."
    },
    {
      "id": "Q8b",
      "key": "amount",
      "section": "Key terms",
      "show_if": {
        "q": "Q8a",
        "in": [
          "yes",
          "partly"
        ]
      },
      "type_by_deal_type": {
        "project": "free_text",
        "default": "amount"
      },
      "text_by_deal_type": {
        "investment": "How much is being invested?",
        "loan": "How much is being lent?",
        "acquisition": "What is the price?",
        "project": "What will each party contribute?",
        "other": "What is the price or value?"
      },
      "placeholder_by_deal_type": {
        "project": "e.g. ABC provides the technology; XYZ provides US$500,000 and its sales team",
        "default": "e.g. USD 2,000,000"
      }
    },
    {
      "id": "Q8c",
      "key": "pricing",
      "section": "Key terms",
      "show_if": {
        "all": [
          {
            "q": "Q8a",
            "in": [
              "yes",
              "partly"
            ]
          },
          {
            "q": "Q1",
            "in": [
              "investment",
              "loan",
              "acquisition",
              "project"
            ]
          }
        ]
      },
      "variants": {
        "investment": {
          "text": "At what valuation?",
          "type": "amount_with_choice",
          "options": [
            {
              "value": "pre",
              "label": "Pre-money"
            },
            {
              "value": "post",
              "label": "Post-money"
            },
            {
              "value": "unsure",
              "label": "Not sure"
            }
          ],
          "help": "Pre-money is the value before the new money goes in; post-money includes it."
        },
        "loan": {
          "text": "What interest rate, and for how long?",
          "type": "rate_and_period",
          "placeholder": "e.g. 12% a year, for 12 months"
        },
        "acquisition": {
          "text": "How is the price worked out?",
          "type": "single_choice",
          "allow_other": true,
          "other_label": "Other (please type)",
          "options": [
            {
              "value": "fixed",
              "label": "Fixed price"
            },
            {
              "value": "adjusted",
              "label": "Adjusted for cash and debt at completion"
            },
            {
              "value": "earn_out",
              "label": "Part depends on future performance (earn-out)"
            }
          ]
        },
        "project": {
          "text": "How will revenue or costs be shared?",
          "type": "free_text",
          "placeholder": "e.g. revenue split 60/40; each party bears its own costs"
        }
      },
      "required": false
    },
    {
      "id": "Q8d",
      "key": "payment",
      "section": "Key terms",
      "show_if": {
        "all": [
          {
            "q": "Q8a",
            "in": [
              "yes",
              "partly"
            ]
          },
          {
            "q": "Q1",
            "not_in": [
              "project"
            ]
          }
        ]
      },
      "type": "single_choice",
      "allow_other": true,
      "other_label": "Other (please type)",
      "required": false,
      "text_by_deal_type": {
        "loan": "How will it be repaid?",
        "default": "How will it be paid?"
      },
      "options_by_deal_type": {
        "loan": [
          {
            "value": "bullet",
            "label": "In one payment at the end",
            "recommended": true
          },
          {
            "value": "instalments",
            "label": "In instalments (describe)",
            "needs_detail": true
          }
        ],
        "acquisition": [
          {
            "value": "completion",
            "label": "All at completion",
            "recommended": true
          },
          {
            "value": "deferred",
            "label": "Part now, part later (describe)",
            "needs_detail": true
          },
          {
            "value": "shares",
            "label": "Partly in shares (describe)",
            "needs_detail": true
          }
        ],
        "default": [
          {
            "value": "completion",
            "label": "All at once when signed",
            "recommended": true
          },
          {
            "value": "tranches",
            "label": "In stages (describe)",
            "needs_detail": true
          }
        ]
      },
      "default": "completion"
    },
    {
      "id": "Q8e",
      "key": "other_terms",
      "section": "Key terms",
      "type": "free_text_list",
      "max_items": 5,
      "max_length": 200,
      "required": false,
      "text": "Any other key terms?",
      "placeholder_by_deal_type": {
        "investment": "e.g. Investor gets one board seat",
        "loan": "e.g. Loan secured on the founder’s shares",
        "acquisition": "e.g. Founder stays on as CEO for 2 years",
        "project": "e.g. Each party keeps its own IP",
        "default": "One term per line"
      }
    },
    {
      "id": "Q9",
      "key": "conditions",
      "section": "Conditions",
      "type": "multi_choice",
      "allow_other": true,
      "other_label": "Other (please type)",
      "required": true,
      "text": "Does anything need to happen before the deal can close?",
      "options": [
        {
          "value": "due_diligence",
          "label": "Due diligence (checking the business)"
        },
        {
          "value": "corporate_approvals",
          "label": "Board or shareholder approval"
        },
        {
          "value": "regulatory_approvals",
          "label": "Regulatory approval"
        },
        {
          "value": "none",
          "label": "None",
          "exclusive": true
        }
      ],
      "default": {
        "rule": [
          {
            "when": {
              "all": [
                {
                  "q": "Q2",
                  "eq": "issuer"
                },
                {
                  "q": "Q1",
                  "in": [
                    "investment"
                  ]
                }
              ]
            },
            "value": [
              "due_diligence"
            ]
          },
          {
            "when": {
              "all": [
                {
                  "q": "Q2",
                  "eq": "issuer"
                },
                {
                  "q": "Q1",
                  "in": [
                    "loan",
                    "acquisition"
                  ]
                }
              ]
            },
            "value": [
              "due_diligence",
              "corporate_approvals"
            ]
          },
          {
            "else": [
              "none"
            ]
          }
        ]
      }
    },
    {
      "id": "Q10a",
      "key": "signing_target",
      "section": "Timing",
      "type": "period_or_date",
      "required": false,
      "text": "When do you want to sign the final agreements?",
      "options": [
        {
          "value": "P1M",
          "label": "Within 1 month",
          "recommended": true
        },
        {
          "value": "P2M",
          "label": "Within 2 months"
        },
        {
          "value": "unsure",
          "label": "Not sure"
        }
      ],
      "allow_date": true,
      "default": "P1M"
    },
    {
      "id": "Q10b",
      "key": "completion_target",
      "section": "Timing",
      "type": "date",
      "required": false,
      "text": "When should the deal close?",
      "options": [
        {
          "value": "unsure",
          "label": "Not sure",
          "recommended": true
        }
      ],
      "allow_date": true,
      "default": "unsure"
    },
    {
      "id": "Q11",
      "key": "exclusivity",
      "section": "Protections",
      "type": "yes_no_period",
      "allow_other": true,
      "other_label": "Other (please type)",
      "required": true,
      "text": "Should the other side agree not to negotiate with anyone else for a while?",
      "help": "This is called exclusivity. It protects the side spending time and money on the deal. It is legally binding.",
      "options": [
        {
          "value": "no",
          "label": "No"
        },
        {
          "value": "P30D",
          "label": "Yes, for 30 days"
        },
        {
          "value": "P45D",
          "label": "Yes, for 45 days"
        },
        {
          "value": "P90D",
          "label": "Yes, for 90 days"
        }
      ],
      "default": {
        "rule": [
          {
            "when": {
              "all": [
                {
                  "q": "Q2",
                  "eq": "issuer"
                },
                {
                  "q": "Q1",
                  "eq": "investment"
                }
              ]
            },
            "value": "P45D"
          },
          {
            "when": {
              "all": [
                {
                  "q": "Q2",
                  "eq": "issuer"
                },
                {
                  "q": "Q1",
                  "in": [
                    "loan",
                    "acquisition"
                  ]
                }
              ]
            },
            "value": "P90D"
          },
          {
            "else": "no"
          }
        ]
      }
    },
    {
      "id": "Q12",
      "key": "confidentiality",
      "section": "Protections",
      "type": "yes_no",
      "required": true,
      "text": "Should the term sheet be kept confidential?",
      "help": "Recommended in almost every case. It is legally binding.",
      "options": [
        {
          "value": "yes",
          "label": "Yes",
          "recommended": true
        },
        {
          "value": "no",
          "label": "No"
        }
      ],
      "default": "yes"
    },
    {
      "id": "Q13",
      "key": "costs",
      "section": "Protections",
      "type": "single_choice",
      "allow_other": true,
      "other_label": "Other (please type)",
      "required": true,
      "text": "Who pays the legal costs?",
      "options": [
        {
          "value": "own",
          "label": "Each side pays its own",
          "recommended": true
        },
        {
          "value": "capped",
          "label": "{party_2_role} pays {party_1_role}'s costs up to a limit",
          "needs_amount": true
        }
      ],
      "default": "own",
      "help": "Legally binding. Applies whether or not the deal goes ahead."
    }
  ]
} as const;
