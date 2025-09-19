/**
 * Email helpers
 * Exports:
 *  - applyEmailPattern(fullName, domain, pattern="first.last") -> string email
 *  - inferPatternFromSamples(domain, samples)
 *  - verifyEmailSMTP(email)  (stub; returns unknown unless you wire NB/ZB)
 */

function clean(s=""){ return String(s).normalize("NFKD"); }
function splitName(fullName=""){
  const raw = clean(fullName).trim().replace(/\s+/g," ");
  if (!raw) return ["",""];
  const parts = raw.split(" ");
  return [parts[0]||"", parts.length>1 ? parts[parts.length-1] : ""];
}
function slug(s=""){ return clean(s).toLowerCase().replace(/[^a-z]/g,""); }
function normDomain(d=""){ return String(d).trim().toLowerCase().replace(/^https?:\/\//,"").replace(/\/.*$/,""); }

/** Build email from a pattern id */
export function applyEmailPattern(fullName, domain, pattern="first.last"){
  if (!fullName || !domain) return null;
  const dom = normDomain(domain);
  const [fraw, lraw] = splitName(fullName);
  const f = slug(fraw), l = slug(lraw), fi = f.slice(0,1), li = l.slice(0,1);
  const table = {
    "first.last": `${f}.${l}@${dom}`,
    "firstlast":  `${f}${l}@${dom}`,
    "f.last":     `${fi}.${l}@${dom}`,
    "first.l":    `${f}.${li}@${dom}`,
    "first_last": `${f}_${l}@${dom}`,
    "first-last": `${f}-${l}@${dom}`,
    "first":      `${f}@${dom}`,
    "last":       `${l}@${dom}`,
    "firstl":     `${f}${li}@${dom}`,
    "flast":      `${fi}${l}@${dom}`,
  };
  return table[pattern] || table["first.last"];
}

export function inferPatternFromSamples(domain, samples=[]){
  const dom = normDomain(domain);
  const pats = ["first.last","firstlast","f.last","first.l","first_last","first-last","first","last","firstl","flast"];
  const score = Object.fromEntries(pats.map(p=>[p,0]));
  for (const e of samples){
    if (typeof e!=="string") continue;
    const email = e.toLowerCase().trim();
    if (!email.endsWith(`@${dom}`)) continue;
    const local = email.split("@")[0];
    if (/\./.test(local)) score["first.last"]+=1;
    if (!/\W/.test(local)) score["firstlast"]+=0.5;
    if (/^[a-z]\.[a-z]/.test(local)) score["f.last"]+=1;
    if (/^[a-z]+\.[a-z]$/.test(local)) score["first.l"]+=1;
    if (/_/.test(local)) score["first_last"]+=1;
    if (/-/.test(local)) score["first-last"]+=1;
  }
  const best = Object.entries(score).sort((a,b)=>b[1]-a[1])[0];
  return best && best[1]>0 ? best[0] : "first.last";
}

export async function verifyEmailSMTP(_email){
  if (!process.env.NEVERBOUNCE_API_KEY && !process.env.ZEROBOUNCE_API_KEY) {
    return { status:"unknown", reason:"no_verifier" };
  }
  return { status:"unknown", reason:"not_implemented" };
}
