// Canonical Protestant book numbering, also used by the existing Bible converters.
export const englishBooks =
    "Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|1 Samuel|2 Samuel|1 Kings|2 Kings|1 Chronicles|2 Chronicles|Ezra|Nehemiah|Esther|Job|Psalms|Proverbs|Ecclesiastes|Song of Solomon|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|1 Corinthians|2 Corinthians|Galatians|Ephesians|Philippians|Colossians|1 Thessalonians|2 Thessalonians|1 Timothy|2 Timothy|Titus|Philemon|Hebrews|James|1 Peter|2 Peter|1 John|2 John|3 John|Jude|Revelation".split(
        "|"
    )
const tamilBooks =
    "ஆதியாகமம்|யாத்திராகமம்|லேவியராகமம்|எண்ணாகமம்|உபாகமம்|யோசுவா|நியாயாதிபதிகள்|ரூத்|1 சாமுவேல்|2 சாமுவேல்|1 இராஜாக்கள்|2 இராஜாக்கள்|1 நாளாகமம்|2 நாளாகமம்|எஸ்றா|நெகேமியா|எஸ்தர்|யோபு|சங்கீதம்|நீதிமொழிகள்|பிரசங்கி|உன்னதப்பாட்டு|ஏசாயா|எரேமியா|புலம்பல்|எசேக்கியேல்|தானியேல்|ஓசியா|யோவேல்|ஆமோஸ்|ஒபதியா|யோனா|மீகா|நாகூம்|ஆபகூக்|செப்பனியா|ஆகாய்|சகரியா|மல்கியா|மத்தேயு|மாற்கு|லூக்கா|யோவான்|அப்போஸ்தலர்|ரோமர்|1 கொரிந்தியர்|2 கொரிந்தியர்|கலாத்தியர்|எபேசியர்|பிலிப்பியர்|கொலோசெயர்|1 தெசலோனிக்கேயர்|2 தெசலோனிக்கேயர்|1 தீமோத்தேயு|2 தீமோத்தேயு|தீத்து|பிலேமோன்|எபிரெயர்|யாக்கோபு|1 பேதுரு|2 பேதுரு|1 யோவான்|2 யோவான்|3 யோவான்|யூதா|வெளிப்படுத்தின விசேஷம்".split(
        "|"
    )
const sinhalaBooks =
    "උත්පත්ති|නික්මයාම|ලෙවී කථාව|ගණන් කථාව|ද්විතීය කථාව|යෝෂුවා|විනිශ්චයකාරයන්|රූත්|1 සාමුවෙල්|2 සාමුවෙල්|1 රාජාවලිය|2 රාජාවලිය|1 ලේකම්|2 ලේකම්|එස්රා|නෙහෙමියා|එස්තර්|යෝබ්|ගීතාවලිය|හිතෝපදේශ|දේශනාකාරයා|සලමොන්ගේ ගීතිකාව|යෙසායා|යෙරෙමියා|විලාප ගී|එසකියෙල්|දානියෙල්|හොෂෙයා|යෝවෙල්|ආමොස්|ඔබදියා|යෝනා|මීකා|නාහුම්|හබක්කුක්|ශෙපනියා|හග්ගයි|සෙකරියා|මලාකි|මතෙව්|මාර්ක්|ලූක්|යොහන්|ක්‍රියා|රෝම|1 කොරින්ති|2 කොරින්ති|ගලාති|එපීස|පිලිප්පි|කොලොස්සි|1 තෙසලෝනික|2 තෙසලෝනික|1 තිමෝති|2 තිමෝති|තීතස්|පිලෙමොන්|හෙබ්‍රෙව්|යාකොබ්|1 පේතෘස්|2 පේතෘස්|1 යොහන්|2 යොහන්|3 යොහන්|යූදස්|එළිදරව්".split(
        "|"
    )

export function normalizeBibleSearch(value: string): string {
    return value
        .normalize("NFC")
        .replace(/[௦-௯]/g, (digit) => String(digit.charCodeAt(0) - 0x0be6))
        .toLocaleLowerCase()
        .replace(/[\u200b-\u200d]/g, "")
        .replace(/(?<=\p{L})\./gu, "")
        .replace(/\s+/g, " ")
        .trim()
}

export function bookAliases(number: number, ...names: (string | undefined)[]): string[] {
    const values = [...names, englishBooks[number - 1], tamilBooks[number - 1], sinhalaBooks[number - 1]]
    if (number === 19) values.push("Psalm", "Ps", "Psa", "சங்கீதங்கள்")
    if (number === 22) values.push("Song of Songs")
    return [...new Set(values.filter((s): s is string => !!s).map(normalizeBibleSearch))]
}

const canonicalAliases = englishBooks.map((_, i) => bookAliases(i + 1))
const canonicalNumbers = new Map(canonicalAliases.flatMap((aliases, i) => aliases.map((alias) => [alias, i + 1] as const)))

export function resolveBookNumber(name: string): number | undefined {
    const normalized = normalizeBibleSearch(name)
    const exact = canonicalNumbers.get(normalized)
    if (exact) return exact
    if (/^\d+$/.test(normalized) && Number(normalized) >= 1 && Number(normalized) <= 66) return Number(normalized)
    const matches = canonicalAliases.flatMap((aliases, i) => (normalized.length >= 2 && aliases.some((alias) => alias.startsWith(normalized)) ? [i + 1] : []))
    return matches.length === 1 ? matches[0] : undefined
}
