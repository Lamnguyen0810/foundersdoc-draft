/**
 * Schedule 3 Part B — the Target Company warranties, from the SPA precedent
 * (redacted: SPA_Precedent_REDACTED.docx), paragraph for paragraph.
 *
 * GENERATED from the redacted Word file by a script, then read through:
 * the only changes are "the Seller" made to read for one or more sellers,
 * and the US$ thresholds put in the deal's currency ({{currency}}). The
 * paragraphs are numbered in this order when drawn (1, 1.1, 1.1.1, (a)), so
 * the cross-references in the wording ("paragraph 13.1", "paragraph 8.4.1")
 * stay right. Do not reorder without checking them.
 */

export interface WarrantyPara {
  text: string;
  subs?: string[];
  /** Unnumbered lines after the (a), (b) items. */
  tail?: string[];
}

export interface WarrantyItem {
  /** A sub-heading ("Latest Accounts"), or none for a plain numbered paragraph. */
  title?: string;
  text?: string;
  subs?: string[];
  tail?: string[];
  paras?: WarrantyPara[];
}

export interface WarrantySection {
  heading: string;
  items: WarrantyItem[];
}

export const PART_B: WarrantySection[] = [
  {
    heading: "Corporate Status, Information and Authority",
    items: [
      { text: "The Target Company is a company duly incorporated under the laws of its jurisdiction of incorporation." },
      { text: "The shares of the Target Company are free from all Encumbrances and there is no agreement or commitment to give or create any Encumbrance over or affecting such shares and no claim has been made by any person to be entitled to any such Encumbrance." },
      { text: "The Target Company maintains all statutory books and other records in accordance with all applicable legal requirements, and such books and records contain up-to-date, complete and accurate records of all matters required to be dealt with therein." },
      { text: "The Target Company has obtained all requisite consents, authorisations and approvals (or, as the case may be, the relevant waiver(s)), completed all other necessary registrations and filings (if applicable), and executed all other documents in connection with the performance of the terms of this Agreement and the transactions contemplated hereunder." },
    ],
  },
  {
    heading: "Accuracy and Adequacy of Information Disclosed to the Buyer",
    items: [
      { text: "All information contained in this Agreement and all other information which has been given in writing or electronic form or made available by or on behalf of the Target Company to the Buyer or any of their agents, employees or professional advisers in the course of the negotiations leading to this Agreement or in the course of any due diligence or other investigation carried out by or on behalf of the Buyer prior to entering into this Agreement was when given and remains true, complete and accurate in all material respects and not misleading in any respect and no Seller is aware of any fact or matter or circumstances not disclosed in writing to the Buyer which renders any such information untrue, inaccurate or misleading in any respect." },
      { text: "The financial forecasts and business plans of the Target Company provided to the Buyer:", subs: ["have been diligently prepared on assumptions which have been carefully considered and are honestly believed to be reasonable, having regard to the information available and the prevailing market conditions at the time of the preparation and up to the date of this Agreement, and having taken into account all matters within management control which could materially and adversely affect their achievement (other than general economic factors); and", "represent a fair, valid and realistic forecast or plan in relation to the future progress, expansion and development of the financial performance and business operations of the Target Company."] },
    ],
  },
  {
    heading: "Corporate Information",
    items: [
      { title: "The Target Company", paras: [
          { text: "No person has the right (whether exercisable now or in the future and whether contingent or not) to call for the allotment, conversion, issue, registration, sale, transfer, amortisation or repayment of any share or loan capital or any other security giving rise to a right over the capital of the Target Company under any option or other agreement (including conversion rights and rights of pre-emption)." },
          { text: "The issued share capital of the Target Company is fully paid up in accordance with the applicable legal requirements." },
          { text: "There are no Encumbrances in any shares of the Target Company or any arrangements or obligations to create any such Encumbrances." },
          { text: "No shares of the Target Company have been and are listed on any stock exchange or regulated market." },
          { text: "Save as otherwise stated in this Agreement, the Target Company does not have:", subs: ["any interests in or has agreed to acquire, any equity interests or share capital or other security of any other company or entity (wherever incorporated); or", "any branch, division or establishment outside the jurisdiction in which it is incorporated."] },
          { text: "The Target Company has not given a power of attorney or any other authority which is still outstanding or effective to any person to enter into any contract or commitment or to do anything on its behalf, other than any authority to its employees to enter into routine trading contracts in the normal course of their duties and authorities to patent attorneys or agents or trade mark agents for routine prosecution or maintenance of such Intellectual Property Rights as is registered." },
          { text: "The appointment, resignation or termination of any directors, officers or auditors of the Target Company has been carried out in accordance with the applicable legal requirements." },
        ] },
      { title: "Constitutional Documents, Corporate Registers and Minute Books", paras: [
          { text: "The copies of the business licence, articles of association and other constitutional documents (if any) of the Target Company delivered to the Buyer are true and accurate copies of the originals, and set out the rights and restrictions attaching to the equity of the Target Company and there have not been and are not any breaches by the Target Company of its business licence or constitutional documents." },
          { text: "The statutory books, books of account and other records of whatsoever kind of the Target Company:", subs: ["are up-to-date;", "are maintained in accordance with all applicable legal requirements; and", "contain true, complete and accurate records of all matters required to be dealt with in such books and records."] },
          { text: "All books and records referred to in paragraph 3.2.2 and all other documents (including ownership certificates and copies of all subsisting agreements to which the Target Company is a party) which are the property of the Target Company and under the applicable legal requirements ought to be in its possession are in the possession (or under the control) of the Target Company and no notice or allegation that any of such books and records is incorrect or should be rectified has been received." },
          { text: "All accounts, documents and returns required by law to be delivered or made to any Government Authority have been duly delivered or made on a timely basis." },
        ] },
    ],
  },
  {
    heading: "Accounts",
    items: [
      { title: "Latest Accounts", paras: [
          { text: "The Accounts have been prepared:", subs: ["in accordance with all applicable Laws and the accounting principles, standards and practices generally accepted at the date of this Agreement in the jurisdiction to which the Target Company may be subject; and", "subject to paragraph 4.1.1(a), on the accounting policies consistent with that adopted in preparing the audited account since the incorporation of the Target Company."] },
          { text: "The Accounts give a true and fair view of the assets, liabilities and state of affairs of the Target Company at the Accounts Date and of the profits or losses for the period ended on such date." },
          { text: "As at the Accounts Date, the Accounts:", subs: ["make full provision for all material actual liabilities;", "disclose all material contingent liabilities; and", "make provision reasonably regarded as adequate for all bad and doubtful debts."] },
        ] },
      { title: "Management Accounts", paras: [
          { text: "The Management Accounts have been prepared in accordance with the accounting principles, standards and practices generally accepted at the date of this Agreement in the jurisdiction to which the Target Company may be subject, and have been prepared in accordance with the policies used in preparing the Accounts applied on a consistent basis." },
          { text: "The Management Accounts are fair and not misleading and do not materially misstate the assets and liabilities of the Target Company as at the Relevant Management Accounts Date nor the profits and losses of the Target Company for the period ended on such date." },
        ] },
      { title: "Depreciation of Fixed Assets", text: "In the Accounts, Management Accounts and in the previous accounts of the Target Company (if any), the fixed assets of the Target Company have been depreciated in accordance with the accounting principles set out in the Accounts, standards and practices generally accepted at the date of this Agreement in the jurisdiction(s) to which the Target Company may be subject." },
      { title: "Taxation", paras: [
          { text: "Provision or reserve which is considered by the director(s) of the Target Company as appropriate has been made in the Management Accounts for all Taxation liable to be assessed on the Target Company or for which each is or may become accountable including without limitation in respect of:", subs: ["profits, gains, income, grants or subsidies (as computed for Taxation purposes) arising or accruing or deemed to arise or accrue on or before the Accounts Date (or in relation to the Management Accounts, the Relevant Management Accounts Date); and", "any transaction effected or deemed to be effected on or before the Accounts Date (or in relation to the Management Accounts, the Relevant Management Accounts Date) or provided for in the Accounts or the Management Accounts."] },
          { text: "Provision for deferred taxation which is considered by the director(s) of the Target Company as appropriate has been made in the Accounts and the Management Accounts in accordance with accounting principles, standards and practices generally accepted at the date of this Agreement in the jurisdiction(s) to which the Target Company may be subject." },
        ] },
    ],
  },
  {
    heading: "Financial Obligations",
    items: [
      { title: "Financial Facilities", text: "Save as disclosed in the Accounts and the Management Accounts, the Target Company does not have any outstanding debts, liabilities, or financial facilities (including loans, derivatives and hedging arrangements) as at the date of this Agreement. There are no circumstances whereby the continuation of any such facilities might be prejudiced or affected as a result of a transaction effected by this Agreement." },
      { title: "Guarantees", text: "There is no outstanding guarantee, indemnity, suretyship or security (whether or not legally binding) given by or for the benefit of the Target Company." },
      { title: "Borrowing Limits", paras: [
          { text: "The amounts borrowed by the Target Company under overdraft facilities do not exceed applicable overdraft limits." },
          { text: "The amounts borrowed by the Target Company do not exceed any limitation on its borrowings contained in any agreement or instrument binding upon it." },
        ] },
      { title: "Off-Balance Sheet Financing", text: "The Target Company does not have any outstanding loan capital, nor has it factored, discounted or authorised any of its debts, nor has it engaged in any financing of a type which would not be required to be shown or reflected in the Accounts or borrowed any money which it has not repaid." },
      { title: "Grants and Subsidies", paras: [
          { text: "The entering into and the performance of any of the Agreement and any of the documents to be entered into pursuant to or in connection with the Agreement will not result in the forfeiture or repayment of any grant, subsidy or financial aid." },
          { text: "There are no current applications for Government Authority investment grants, loan subsidies or financial aid being made by the Target Company." },
        ] },
      { title: "Liabilities", paras: [
          { text: "There are no liabilities, whether actual or contingent, of the Target Company other than (a) liabilities disclosed or provided for in the Accounts, (b) liabilities incurred in the ordinary and usual course of business since the Accounts Date, none of which is material, or (c) liabilities disclosed elsewhere in the Agreement or information/ documents provided during the course of due diligence carried by or on behalf of the Buyer." },
          { text: "All the liabilities disclosed or provided for in the Accounts (other than the liabilities incurred in the ordinary and usual course of business of the Target Company) have been or will be settled prior to the Closing." },
        ] },
    ],
  },
  {
    heading: "Assets",
    items: [
      { title: "Real Properties and Buildings", paras: [
          { text: "The Target Company has the legal right to use all real properties leased, occupied and used by them free of any third-party interests or other Encumbrances of any form." },
          { text: "The Target Company does not own any real property and buildings. The leases, tenancies, licences, concessions or agreements in relation to the use of the office premises of the Target Company are held under valid, subsisting and enforceable contracts, leases or other grants." },
          { text: "No default (or event which with notice or lapse of time, or both, would constitute a default) by the Target Company has occurred and is continuing under any of such leases, tenancies, licences, concessions or agreements." },
          { text: "There are no grounds for rescission, avoidance or repudiation of any of such leases, tenancies, licences, concessions or agreements and no notice of termination or of intention to terminate has been received in respect of any thereof." },
          { text: "The Target Company does not have notice of any claim of any nature that has been asserted by anyone adverse to the rights of the Target Company, as the case may be, under such leases, tenancies, licences, concessions or agreements or negatively affecting the rights of the Target Company to the continued possession of such property or other assets." },
        ] },
      { title: "Ownership of Assets", text: "All assets included in the Accounts or acquired by the Target Company or which have otherwise arisen since the Accounts Date, other than any assets disposed of or realised in the ordinary and usual course of business:", subs: ["are assets over which the Target Company has lawful ownership rights;", "are, where capable of possession, in the possession or under the control of the Target Company;", "are free from Encumbrances; and", "are not the subject of any factoring arrangement, conditional sale or credit agreement."] },
      { title: "Accounts Receivable", text: "None of the accounts receivable by the Target Company which are included in the Accounts or which have subsequently arisen:", subs: ["has been outstanding for more than three (3) months from its due date for payment and is of an amount exceeding {{currency}}1,000 (or its equivalent in other currencies), or", "has been released on terms that the debtor has paid less than the full value of his/her debt,"], tail: ["and all such debts have realised or will realise in the normal course of collection their full value as included in the Accounts or in the books of the Target Company after taking into account the provision for bad and doubtful debts made in the Accounts. For the avoidance of doubt, a debt shall not be regarded as realising its full value to the extent that it is paid, received or otherwise recovered in circumstances in which such payment, receipt or recovery is or may be void, voidable or otherwise liable to be reclaimed or set aside."] },
      { title: "Plant and Machinery", text: "The plant and machinery, vehicles and other equipment owned or used by the Target Company are in good repair and condition and in reasonable working order, have been regularly and properly maintained and are not dangerous, obsolete, inefficient or surplus to requirements." },
      { title: "Sufficiency of Assets", text: "The property, rights and assets owned, or leased by the Target Company comprise all the property, rights and assets necessary or convenient for the carrying on of the business of the Target Company fully and effectively in and to the extent to which it is presently being conducted." },
    ],
  },
  {
    heading: "Intellectual Property and Knowhow",
    items: [
      { title: "Sufficiency of Intellectual Property Rights and Knowhow", text: "The Target Company owns or has valid and enforceable licences to use all the Intellectual Property Rights and Knowhow necessary or convenient for the carrying on of the business of the Target Company fully and effectively in the manner in, and to the extent to, which it is or has been conducted at, or in the one (1) year immediately before, the Closing." },
      { title: "Ownership of Intellectual Property Rights", text: "All Intellectual Property Rights owned by or licensed to the Target Company are:", subs: ["valid, subsisting and enforceable and no act or omission has been done or not been done which may cause them to cease to be valid, subsisting and enforceable;", "not subject to any claim or opposition from any person as to title, validity, enforceability, or otherwise; and", "free from any licence, Encumbrance, restriction on use or exploitation, option to buy or sell, or disclosure obligation."], paras: [
          { text: "The entry into or performance of this Agreement with the Buyer and the exercise by the Buyer of its rights under this Agreement will not result in the termination of, or affect, any Intellectual Property Rights owned by or licensed to the Target Company." },
        ] },
      { title: "Registration", text: "All application and renewal fees payable in respect of the registered Intellectual Property Rights owned by or licensed to the Target Company have been paid. All other reasonable steps necessary to apply for, maintain and protect the registered rights have been taken. There are no grounds on which any registration or application for registration in respect of any such rights may be challenged, refused, forfeited or modified." },
      { title: "IP Licences", paras: [
          { text: "The Target Company has not granted nor is it obliged to grant any licences in respect of all or any part of the Intellectual Property Rights owned by it. There are no pending or threatened applications for licences of right, compulsory licences or equivalent relief in any jurisdiction in respect of such rights." },
        ] },
      { title: "Infringement", paras: [
          { text: "The Target Company has neither infringed nor been infringing the Intellectual Property Rights of any other person." },
          { text: "There is no pending or potential infringement and/or dispute related to the use of any Intellectual Property Rights by the Target Company." },
          { text: "No third party has infringed or is infringing the Intellectual Property Rights of the Target Company." },
        ] },
      { title: "Advertising and Marketing Materials", text: "All advertising and marketing material used or proposed to be used in connection with the business of the Target Company complies with all legal and regulatory requirements in all material respects in all countries in which such material is used or proposed to be used. There are no grounds under which such material could be challenged or give rise to any complaint or liability for any reason whatsoever including, without limitation, defamation, trade libel, copyright, moral rights or any analogous law." },
      { title: "Assignment of rights", text: "All persons, including current and former employees, contractors or consultants, who have contributed to the development, creation or invention of any material Intellectual Property Rights owned or purported to be owned by the Target Company, have entered into valid and enforceable written agreements in which such persons have assigned to the Target Company any and all ownership interests or rights they may have in such Intellectual Property Rights." },
    ],
  },
  {
    heading: "Contracts",
    items: [
      { title: "Capital Commitments", text: "There are no capital commitments entered into or proposed by the Target Company." },
      { title: "Contracts", text: "The Target Company is not a party to or subject to any contract, transaction, arrangement, understanding or obligation which:", subs: ["is not in the ordinary and usual course of business;", "is not wholly on an arm’s length basis;", "is of a long-term nature that is, unlikely to have been fully performed, in accordance with its terms, more than six (6) months after the date on which it was entered into or undertaken or is incapable of termination in accordance with its terms by the Target Company on six (6) months’ notice or less;", "is of a loss-making nature (that is, known to be likely to result in loss on completion or performance);", "cannot readily be fulfilled or performed without undue or unusual expenditure of money or effort;", "restricts its freedom to carry on its business in any part of the world in such manner as it thinks fit; and", "involves an aggregate outstanding expenditure by it of more than {{currency}}10,000 (or its equivalent in other currencies), exclusive of Tax."] },
      { title: "Arrangements with Connected Persons", paras: [
          { text: "There is no indebtedness (actual or contingent) nor any loan, indemnity, guarantee or security arrangement in the Target Company, any shareholder of the Target Company and any current or former employee, current or former director or any current or former consultant of the Target Company." },
          { text: "There are no existing contracts, arrangements or understandings (whether legally binding or not) between or involving, on the one hand, the Target Company and, on the other hand, any shareholder of the Target Company, any director or consultant of the Target Company and/or any person connected with any of them." },
          { text: "The Target Company is or has not been party to any contract, arrangement or understanding with any current or former employee, current or former director or any current or former consultant of the Target Company or any person connected with any of such persons or any person connected with any of such persons, or in which any such person is interested (whether directly or indirectly)." },
        ] },
      { title: "Compliance with Agreements", paras: [
          { text: "All the contracts and all leases, tenancies, licences, concessions and agreements which are material to the business and operation of the Target Company and to which the Target Company is a party are valid, binding and enforceable obligations of the Target Company and the terms thereof have been complied with by the Target Company." },
          { text: "There are no grounds for rescission, avoidance or repudiation of any of such contracts or matters referred to in paragraph 8.4.1 and no notice of termination or of intention to terminate has been received in respect of any of them." },
          { text: "There are no contracts, agreements or arrangements to which the Target Company is a party that are illegal, registrable or notifiable under any of the laws or regulations of the jurisdiction in which it is incorporated or any other applicable Laws." },
        ] },
      { title: "Effect of Acquisition", text: "Neither the entry into, nor compliance with, nor completion of this Agreement nor the entry into, compliance with, or completion of the transactions contemplated by the Agreement will, or is likely to:", subs: ["cause the Target Company to lose the benefit of any right or privilege it presently enjoys;", "cause any person who normally does business with or gives credit to the Target Company not to continue to do so on the same basis;", "cause any Key Personnel to leave his or her employment, prejudicially affect the attitude or action of Government Authorities, major customers and suppliers with regard to the Target Company; or", "result in a breach of, or give any third party a right to terminate or vary, or result in any Encumbrance under, any contract or arrangement to which the Target Company is a party."] },
    ],
  },
  {
    heading: "Employees",
    items: [
      { title: "Employees and Terms of Employment", paras: [
          { text: "The Target Company has entered into employment contracts with all of its employees, and there is no labour or employment contract or agreement which has not been entered into pursuant to the requirements of the law of the jurisdiction in which it is incorporated or operates." },
          { text: "All agreements or arrangements relating to the employment of the employees of the Target Company have been entered into on an arm’s length basis between the relevant parties." },
          { text: "There is no agreement or arrangement in place in the Target Company and any trade union or other organisation representing all, or any group of, employees of the Target Company." },
        ] },
      { title: "Termination of Employment", paras: [
          { text: "Since the Accounts Date, no Key Personnel has given or received notice terminating his or her employment with the Target Company." },
          { text: "Since the Accounts Date, there have been no proposals to terminate the employment of the Key Personnel." },
          { text: "No claims have been bought against the Target Company for breach of any contract of employment with any employee." },
          { text: "The Target Company has not made or agreed to make any payment or provided or agreed to provide any benefit to any employee or consultant or former employee or consultant of the Target Company or any dependant of any such persons in connection with the actual or proposed termination or suspension of employment other than make payment accordance with the provisions of the applicable employment laws, nor is it liable to make any such payment or to provide any such benefit." },
        ] },
      { title: "Industrial Disputes", text: "The Target Company is not involved in, and there are no circumstances likely to give rise to, any strike or industrial dispute or any dispute or negotiation regarding a claim of material importance with any trade union, staff association or other similar organisation or other body (in any such case whether or not recognised by the Target Company for collective bargaining or other negotiating purpose) representing employees or former employees of the Target Company." },
      { title: "Incentive Schemes", text: "There are no share incentive, share option, profit sharing, bonus or other incentive arrangements for or affecting any employees or other workers or former employees or other former workers of the Target Company." },
      { title: "Pensions and Social Security Funds", paras: [
          { text: "No liability has been or may be incurred by the Target Company for breach of any obligation for contribution to any pension fund or any other social security funds so provided under the law of the jurisdiction in which it is incorporated or the competent authorities from time to time to which the Target Company is obliged to make contributions for its employees (together, the “social security funds”)." },
          { text: "Other than under the social security funds, there are no pension, provident, superannuating or retirement benefit funds, schemes or arrangements under which the Target Company is obliged, whether contractually or otherwise, to provide to any of its employees or officers or former employees or officers or any spouse or other dependants of any such person retirement benefits of any kind (which expression shall include benefits payable upon retirement, leaving service, death, disablement and any other benefits which are commonly provided for under provident or retirement schemes)." },
        ] },
      { title: "Compliance", text: "The Target Company has complied with its obligations to its employees and former employees, whether under the terms of their employment or under the law of the jurisdiction in which it is incorporated or operates." },
    ],
  },
  {
    heading: "Legal Compliance",
    items: [
      { title: "Licences", paras: [
          { text: "All licences, consents, authorisations, confirmations, certificates, approvals, registrations and filings (the “Licences”) necessary for the due establishment of, the carrying on of the businesses and operations as now carried on and as previously carried on by the Target Company have been obtained, are in full force and effect, do not contain conditions which would hinder the ordinary and usual course of business and have been and are being complied with." },
          { text: "There is no investigation, enquiry or proceeding outstanding or anticipated which is likely to result in the suspension, cancellation, modification or revocation of any Licence." },
          { text: "None of the Licences has been breached or is likely to be suspended, cancelled, refused, modified or revoked or its renewal refused (whether as a result of the entry into or completion of this Agreement or the entry into or completion of the transactions contemplated by this Agreement or otherwise)." },
        ] },
      { title: "Compliance with Laws", paras: [
          { text: "The Target Company is conducting, and have conducted, its business, operations and other activities (including the construction of buildings) and hold all its assets in compliance with the applicable laws and regulations of the jurisdictions in which they are incorporated or operate." },
          { text: "The Target Company has not received any notice or other communication from any court, tribunal, arbitrator, Government Authority or regulatory body with respect to an alleged, actual or potential violation and/or failure to comply with any such applicable laws or regulation, or requiring it to take or omit any action." },
        ] },
      { title: "No Questionable Payments", text: "None of the directors, officers, agents, employees or other persons acting on behalf of the Target Company has been party to the use of any of the assets of the Target Company for unlawful contributions, gifts, entertainment or other unlawful expenses relating to political activity or to the making of any direct or indirect unlawful payment to government officials or employees from such assets; to the establishment or maintenance of any unlawful or unrecorded fund of monies or other assets; to the making of any false or fictitious entries in the books or records of the Target Company; or to the making of any unlawful or undisclosed payment." },
    ],
  },
  {
    heading: "No Bribery",
    items: [
      { text: "Neither any Seller nor the Target Company has taken, or caused to be taken, or will take, or cause to be taken, directly or indirectly, any action, including without limitation (a) any contribution, payment or gift of funds or property to any official, employee or agent of any Government Authority or instrumentality, or (b) any contribution to any political party or any candidate for public office, either independently or as part of implementing any aspect of the transactions or actions contemplated in this Agreement, that, if such action had been taken directly by the Buyer or any of its Affiliates, would, or could, (assuming such law, treaty or convention were directly applicable to such entity and any such treaty or convention had the force of law) cause the Buyer or any of its Affiliates to be in violation of the Convention on Combating Bribery of Foreign Public Officials in International Business Transactions adopted by the Organisation for Economic Co-operation and Development or any other relevant law, treaty or convention relating to anti-bribery, anti-corruption or similar matters." },
    ],
  },
  {
    heading: "Anti-Competitive Agreements and Practices",
    items: [
      { text: "The Target Company is not a party to any agreement, arrangement or concerted practice or is or has been carrying on any practice:", subs: ["which in whole or in part may contravene or may be invalidated by any anti-trust, fair trading, dumping, state aid, consumer protection or similar laws or regulations in any jurisdiction; or", "in respect of which any approval, filing, registration or notification is required or is advisable pursuant to the applicable laws and regulations (whether or not the same has in fact been made)."] },
    ],
  },
  {
    heading: "Litigation",
    items: [
      { title: "Proceedings", text: "The Target Company (or any person for whose acts or defaults the Target Company may be vicariously liable) is not involved whether as claimant or defendant or other party in any claim, legal action, proceeding, suit, litigation, prosecution, investigation, enquiry, mediation or arbitration." },
      { title: "Pending or Threatened Proceedings", text: "No such claim, legal action, proceeding, suit, litigation, prosecution, investigation, enquiry, mediation or arbitration referred to in paragraph 13.1 is pending or threatened by or against the Target Company (or any person for whose acts or defaults the Target Company may be vicariously liable)." },
      { title: "Circumstances likely to lead to claims", text: "There are no disputes, investigations, disciplinary proceedings or other circumstances likely to lead to any such claim, legal action, proceeding, suit, litigation, prosecution, investigation, enquiry, mediation or arbitration referred to in paragraph 13.1." },
      { title: "No Court Orders", text: "Neither the Target Company nor any of the properties, assets or operations which it owns or in which it is interested is subject to any continuing injunction, judgment or order of any court, arbitrator, Government Authority or regulatory body, nor in default under any order, licence, regulation or demand of any Government Authority or regulatory body or with respect to any order, suit, injunction or decree of any court." },
    ],
  },
  {
    heading: "Insurance",
    items: [
      { title: "Particulars of Insurance", paras: [
          { text: "All the assets of the Target Company which are material to the operation of the Target Company and are capable of being insured are insured to against risks normally insured against by companies carrying on similar businesses or owning assets of a similar nature." },
          { text: "The Target Company is adequately and effectively covered against accident, physical loss or damage, liability in relation to employees’ compensation, third party liability (including product liability), environmental liability (to the extent that insurance is reasonably available), and other risks normally covered by insurance by such companies." },
        ] },
      { title: "Details of Policies", text: "In respect of the insurances referred to in paragraph 14.1:", subs: ["all premiums and any related insurance premium taxes have been duly paid to date;", "all the policies are in full force and effect;", "no act, omission, misrepresentation or non-disclosure by or on behalf of the Target Company has occurred which makes any of these policies void, voidable or unenforceable; and", "no circumstances have arisen which would render any of the policies void or unenforceable for illegality or otherwise;", "there has been no breach of the terms, conditions and warranties of any of the policies by the Target Company that would entitle insurers to decline to pay all or any part of any claim made under the policies or to terminate any policy.", "there are no special or unusual limits, terms, exclusions or restrictions in any of the policies; and", "no circumstances exist which are likely to give rise to any increase in premiums."] },
      { title: "Insurance Claims", paras: [
          { text: "The Target Company has not made any insurance claims in excess of {{currency}}10,000 (or its equivalent in other currencies) since its incorporation." },
          { text: "No insurance claim in excess of {{currency}}10,000 (or its equivalent in other currencies) is outstanding and no circumstances exist which are likely to give rise to any insurance claim." },
        ] },
      { title: "Claims Refused", text: "No claim has been refused or settled below the amount claimed." },
    ],
  },
  {
    heading: "Taxation",
    items: [
      { title: "Compliance", paras: [
          { text: "The Target Company has within the time limits prescribed by relevant law duly registered with the relevant Taxation authority, duly paid all Tax, made all returns, given all notices, supplied all other information required to be supplied to any Taxation authority and all such information was and remains complete and accurate in all material respects and all such returns and notices were and remain complete and accurate in all material respects and were made on a proper basis and the Target Company is not the subject of a back duty, additional Tax or other Tax investigation and there are no facts which are likely to cause such an investigation to be initiated and no notices of any dispute regarding Tax recoverable from the Target Company or regarding the availability of any relief from Tax to the Target Company have been served or made. The Target Company is or has not at any time since the Relevant Management Accounts Date or the Accounts Date (as applicable) been, liable to pay any penalty or interest on any unpaid Tax." },
          { text: "The Target Company has made all deductions and withholdings in respect or on account of Tax which it is required or entitled by any relevant legislation to make from any payments made by it. The Target Company has accounted in full to the relevant Taxation and fiscal authorities for any Tax so deducted or withheld." },
        ] },
      { title: "Returns, Information and Clearances", paras: [
          { text: "All returns, computations, notices and information which are or have been required to be made or given by the Target Company for any Taxation purpose (a) have been made or given within the requisite periods and on a proper basis and are up-to-date and correct, and (b) none of them is, or is likely to be, the subject of any dispute with any Taxation authorities." },
          { text: "The Target Company is in possession of sufficient information to enable it to compute its liability to Taxation insofar as it depends on any transaction occurring on or before the Closing." },
        ] },
      { title: "Taxation Claims, Liabilities and Reliefs", paras: [
          { text: "There is no liability to Taxation in respect of which a claim could be made against the Buyer in connection with the Target Company and there are no circumstances likely to give rise to such a liability." },
          { text: "No relief (whether by way of deduction, reduction, set-off, exemption, postponement, roll-over, hold-over, repayment or allowance or otherwise) from, against or in respect of any Taxation has been claimed and/or given to the Target Company which could or might be effectively withdrawn, postponed, restricted, clawed back or otherwise lost as a result of any act, omission, event or circumstance arising or occurring at or at any time after the Closing." },
          { text: "The Target Company has not taken any action which has had, or will have, the result of altering, prejudicing or in any way disturbing any arrangement or agreement which it has previously had with any Government Authorities in relation to Taxation." },
        ] },
      { title: "Company Residence", text: "The Target Company has been and continues to be resident for tax purposes in the jurisdiction in which it is incorporated and nowhere else at all times since its incorporation." },
      { title: "Depreciatory Transactions and Value Shifting", text: "No asset owned by the Target Company has at any time since their acquisition by that or any company which has at any time been a member of a group (as defined from time to time for any Taxation purpose) of which the Target Company has at any time been a member been subjected to a reduction in value such that any allowable loss arising on its disposal is likely to be reduced or eliminated or any chargeable gain arising on its disposal is likely to be increased." },
      { title: "Finance Leases", text: "The Target Company is or has not been the lessor or the lessee under any finance lease of an asset. For the purposes of this paragraph, “finance lease” means any arrangements for the leasing of an asset which fall for the purposes of the accounts of the Target Company to be treated in accordance with normal accountancy practice as a finance lease or loan." },
      { title: "Indemnification", text: "The Target Company is not a party to any agreement under which it is liable to indemnify any person with respect to Taxes or otherwise share liability to Taxes with any person." },
      { title: "Avoidance", text: "The Target Company has not at any time been in breach of applicable Laws, entered into, engaged in or been a party to or otherwise been involved in any transaction, scheme or arrangement for the avoidance of, or reduction in liability to, Taxes." },
    ],
  },
  {
    heading: "Important Business Issues since the Accounts Date",
    items: [
      { text: "Since the Accounts Date as regards to the Target Company:", subs: ["there has been no material adverse change in its financial or trading position or prospects, and no event, fact or matter has occurred or is likely to occur which will or is likely to give rise to any such change;", "its business has not been materially and adversely affected by any abnormal factor whether or not affecting similar businesses to a like extent and there are no facts which are likely to give rise to any such effects;", "its business has been carried on as a going concern in the ordinary and usual course, without any interruption or alteration in its nature, scope or manner;", "no material capital commitments have been entered into or proposed by the Target Company. For these purposes, a material capital commitment is one involving capital expenditure of over of {{currency}}20,000 (or its equivalent in other currencies) exclusive of Tax;", "the business has not been materially and adversely affected by the loss of any important customer or source of supply and there are no facts or circumstances which are likely to give rise to any such effects. For these purposes, an important customer or source of supply means one which in any of the years immediately preceding the Accounts Date accounted for 20% or more (in the case of a customer) of the turnover of the Target Company or (in the case of a source of supply) of the goods, services or equipment supplied to the Target Company;", "the Target Company has not declared, made or paid any dividend or other distribution to its members;", "the Target Company has not issued or agreed to issue any equity interest or any other security giving rise to a right over equity interest in it;", "the Target Company has not redeemed or purchased or agreed to redeem or purchase any equity interest in it; and", "the Target Company has not incurred any additional borrowings or incurred any other indebtedness."] },
    ],
  },
  {
    heading: "Insolvency",
    items: [
      { text: "The Target Company is not insolvent or unable to pay its debts when they become due, or is in liquidation under the applicable laws." },
      { text: "The Target Company has not proposed or does not intend to propose any arrangement of any type with its creditors or any group of creditors whether by court process or otherwise." },
      { text: "No petition has been presented, application made, proceedings commenced, resolution passed or meeting convened for the termination, liquidation, bankruptcy or dissolution of the Target Company any process been commenced whereby the business of the Target Company is terminated and the assets of the Target Company are distributed amongst the creditors or shareholders or other contributories of the Target Company or whereby the affairs, business or assets of the Target Company are managed by a person appointed for the purpose by a court, Government Authority or similar body or by any creditor or the Target Company itself, nor has any such order or relief been granted or appointment made, and there are no cases or proceedings under any applicable insolvency, reorganisation, or similar laws in any jurisdiction concerning the Target Company and no events have occurred which, under the law of the jurisdiction in which it is incorporated or it operates, or other applicable Laws, would justify any such cases or proceedings." },
      { text: "No liquidator, trustee, supervisor, nominee, custodian or similar official has been appointed in respect of the whole or any part of the business or assets of the Target Company nor has any step been taken for or with a view to the appointment of such a person nor has any event taken place or is likely to take place as a consequence of which such an appointment might be made." },
      { text: "No creditor of the Target Company has taken, or is entitled to take any steps to enforce, or has enforced any security over any assets of the Target Company or is likely to do so in the immediate future." },
      { text: "The Target Company is not in default of any of its obligations in relation to any of its financial facilities which will constitute an event of default thereto." },
      { text: "None of the businesses or assets of the Target Company are the subject of any seizure, execution or other compulsory disposal procedure, either in whole or in part, no liquidation committee or similar body or person has been appointed in any jurisdiction in respect of the whole or any part of the business or assets of the Target Company and no step has been taken for or with a view to the appointment of such a body or person." },
      { text: "No ruling declaring the insolvency of the Target Company has been made and no public announcement in respect of the same has been pronounced by a court of the jurisdiction in which it is incorporated." },
      { text: "There is no unfulfilled or unsatisfied judgment or order of a court of the jurisdiction in which it is incorporated or it operates outstanding against the Target Company." },
    ],
  },
];
