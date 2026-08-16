/**
 * Indicatifs téléphoniques, par code ISO 3166-1 alpha-2.
 *
 * POURQUOI UNE TABLE SÉPARÉE PLUTÔT QU'UN CHAMP DANS `pays.ts`
 *
 * `pays.ts` sert au profil : il n'a besoin que du code et du nom, et il
 * est chargé sur presque tous les écrans. L'indicatif ne sert qu'au
 * paiement — l'isoler évite d'alourdir tout le reste pour un usage
 * ponctuel.
 *
 * Le sélecteur de paiement ne proposait que DIX-SEPT pays, écrits en dur.
 * Un membre au Nigeria, en Angola ou en diaspora ne trouvait pas son
 * indicatif, et ne pouvait donc pas payer.
 *
 * Les codes suivent exactement ceux de `pays.ts` : toute entrée
 * manquante ferait disparaître le pays du sélecteur.
 */

export const INDICATIFS: Record<string, string> = {
  AF: "+93",   ZA: "+27",   AL: "+355",  DZ: "+213",  DE: "+49",
  AD: "+376",  AO: "+244",  AG: "+1268", SA: "+966",  AR: "+54",
  AM: "+374",  AU: "+61",   AT: "+43",   AZ: "+994",  BS: "+1242",
  BH: "+973",  BD: "+880",  BB: "+1246", BE: "+32",   BZ: "+501",
  BJ: "+229",  BT: "+975",  BY: "+375",  MM: "+95",   BO: "+591",
  BA: "+387",  BW: "+267",  BR: "+55",   BN: "+673",  BG: "+359",
  BF: "+226",  BI: "+257",  KH: "+855",  CM: "+237",  CA: "+1",
  CV: "+238",  CL: "+56",   CN: "+86",   CY: "+357",  CO: "+57",
  KM: "+269",  CG: "+242",  CD: "+243",  KR: "+82",   CR: "+506",
  CI: "+225",  HR: "+385",  CU: "+53",   DK: "+45",   DJ: "+253",
  DM: "+1767", EG: "+20",   AE: "+971",  EC: "+593",  ER: "+291",
  ES: "+34",   EE: "+372",  SZ: "+268",  US: "+1",    ET: "+251",
  FJ: "+679",  FI: "+358",  FR: "+33",   GA: "+241",  GM: "+220",
  GE: "+995",  GH: "+233",  GR: "+30",   GD: "+1473", GT: "+502",
  GN: "+224",  GQ: "+240",  GW: "+245",  GY: "+592",  HT: "+509",
  HN: "+504",  HU: "+36",   IN: "+91",   ID: "+62",   IQ: "+964",
  IR: "+98",   IE: "+353",  IS: "+354",  IL: "+972",  IT: "+39",
  JM: "+1876", JP: "+81",   JO: "+962",  KZ: "+7",    KE: "+254",
  KG: "+996",  KI: "+686",  KW: "+965",  LA: "+856",  LS: "+266",
  LV: "+371",  LB: "+961",  LR: "+231",  LY: "+218",  LI: "+423",
  LT: "+370",  LU: "+352",  MK: "+389",  MG: "+261",  MY: "+60",
  MW: "+265",  MV: "+960",  ML: "+223",  MT: "+356",  MA: "+212",
  MU: "+230",  MR: "+222",  MX: "+52",   MD: "+373",  MC: "+377",
  MN: "+976",  ME: "+382",  MZ: "+258",  NA: "+264",  NP: "+977",
  NI: "+505",  NE: "+227",  NG: "+234",  NO: "+47",   NZ: "+64",
  OM: "+968",  UG: "+256",  UZ: "+998",  PK: "+92",   PA: "+507",
  PG: "+675",  PY: "+595",  NL: "+31",   PE: "+51",   PH: "+63",
  PL: "+48",   PT: "+351",  QA: "+974",  CF: "+236",  DO: "+1809",
  CZ: "+420",  RO: "+40",   GB: "+44",   RU: "+7",    RW: "+250",
  KN: "+1869", SM: "+378",  VC: "+1784", LC: "+1758", SV: "+503",
  WS: "+685",  ST: "+239",  SN: "+221",  RS: "+381",  SC: "+248",
  SL: "+232",  SG: "+65",   SK: "+421",  SI: "+386",  SO: "+252",
  SD: "+249",  SS: "+211",  LK: "+94",   SE: "+46",   CH: "+41",
  SR: "+597",  SY: "+963",  TJ: "+992",  TZ: "+255",  TD: "+235",
  TH: "+66",   TL: "+670",  TG: "+228",  TO: "+676",  TT: "+1868",
  TN: "+216",  TM: "+993",  TR: "+90",   TV: "+688",  UA: "+380",
  UY: "+598",  VU: "+678",  VE: "+58",   VN: "+84",   YE: "+967",
  ZM: "+260",  ZW: "+263",
};

/** `+228` par défaut : la majorité des membres est au Togo. */
export function indicatifDe(code: string): string {
  return INDICATIFS[code] ?? "+228";
}
