"use client";

import { useState } from "react";
import { speakDutch } from "../lib/flashcardUtils";

type TabId = "spelling" | "verbs" | "word-order" | "articles" | "phonetics" | "adjectives";

interface PhoneticPairCard {
  type: "pair";
  word1: string;
  highlight1: string;
  translation1: string;
  word2: string;
  highlight2: string;
  translation2: string;
  explanation: string;
  category: "vowels" | "diphthongs" | "consonants";
}

interface PhoneticSingleCard {
  type: "single";
  word1: string;
  highlight1?: string;
  translation1: string;
  explanation: string;
  category: "vowels" | "diphthongs" | "consonants";
  word2?: never;
  highlight2?: never;
  translation2?: never;
}

type PhoneticCard = PhoneticPairCard | PhoneticSingleCard;

function renderHighlightedWord(word: string, highlight?: string) {
  if (!highlight) return <span className="font-extrabold text-gray-950 text-base">{word}</span>;
  const parts = word.split(highlight);
  if (parts.length <= 1) return <span className="font-extrabold text-gray-950 text-base">{word}</span>;
  return (
    <span className="font-extrabold text-gray-950 text-base">
      {parts[0]}
      <span className="text-orange-600 underline decoration-2 decoration-orange-400">{highlight}</span>
      {parts.slice(1).join(highlight)}
    </span>
  );
}

interface AdjectiveNoun {
  word: string;
  gender: "de" | "het";
  plural: boolean;
  translation: string;
}

const adjectiveNouns: AdjectiveNoun[] = [
  { word: "boom", gender: "de", plural: false, translation: "tree" },
  { word: "boek", gender: "het", plural: false, translation: "book" },
  { word: "auto", gender: "de", plural: false, translation: "car" },
  { word: "huis", gender: "het", plural: false, translation: "house" },
  { word: "meisje", gender: "het", plural: false, translation: "girl" },
  { word: "boeken", gender: "de", plural: true, translation: "books" },
  { word: "huizen", gender: "de", plural: true, translation: "houses" },
  { word: "appels", gender: "de", plural: true, translation: "apples" },
  { word: "kind", gender: "het", plural: false, translation: "child" },
  { word: "kat", gender: "de", plural: false, translation: "cat" },
];

const adjectiveWords = [
  { stem: "groot", combined: "grote", translation: "big" },
  { stem: "klein", combined: "kleine", translation: "small" },
  { stem: "mooi", combined: "mooie", translation: "beautiful" },
  { stem: "oud", combined: "oude", translation: "old" },
  { stem: "snel", combined: "snelle", translation: "fast" },
  { stem: "warm", combined: "warme", translation: "warm" },
];

interface AdjectiveQuizQuestion {
  article: string;
  adjectiveStem: string;
  adjectiveCombined: string;
  noun: string;
  translation: string;
  isEEnding: boolean;
  explanation: string;
}

const adjectiveQuizQuestions: AdjectiveQuizQuestion[] = [
  { article: "Een", adjectiveStem: "groot", adjectiveCombined: "grote", noun: "huis", translation: "a big house", isEEnding: false, explanation: "Huis is a HET-noun (het huis). Preceded by the indefinite article 'een', the adjective gets no ending: 'een groot huis'." },
  { article: "Het", adjectiveStem: "groot", adjectiveCombined: "grote", noun: "huis", translation: "the big house", isEEnding: true, explanation: "Even though 'huis' is a HET-noun, the definite article 'het' is used, so the adjective gets the -e ending: 'het grote huis'." },
  { article: "Een", adjectiveStem: "klein", adjectiveCombined: "kleine", noun: "auto", translation: "a small car", isEEnding: true, explanation: "Auto is a DE-noun (de auto). Regardless of the article, adjectives modifying DE-nouns always get the -e ending: 'een kleine auto'." },
  { article: "De", adjectiveStem: "klein", adjectiveCombined: "kleine", noun: "auto", translation: "the small car", isEEnding: true, explanation: "Auto is a DE-noun. Definite adjectives modifying DE-nouns get the -e ending: 'de kleine auto'." },
  { article: "Een", adjectiveStem: "snel", adjectiveCombined: "snelle", noun: "fiets", translation: "a fast bike", isEEnding: true, explanation: "Fiets is a DE-noun (de fiets). Adjectives modifying DE-nouns always get the -e ending: 'een snelle fiets' (note double 'l' to keep the 'e' short)." },
  { article: "", adjectiveStem: "warm", adjectiveCombined: "warme", noun: "broodjes", translation: "warm bread rolls", isEEnding: true, explanation: "Broodjes is a plural noun. Adjectives modifying plural nouns always get the -e ending, even with no article: 'warme broodjes'." },
  { article: "Een", adjectiveStem: "mooi", adjectiveCombined: "mooie", noun: "meisje", translation: "a beautiful girl", isEEnding: false, explanation: "Meisje is a HET-noun (het meisje, all diminutives end in -je and are HET-words). Preceded by 'een', the adjective gets no ending: 'een mooi meisje'." },
  { article: "Het", adjectiveStem: "mooi", adjectiveCombined: "mooie", noun: "meisje", translation: "the beautiful girl", isEEnding: true, explanation: "Meisje is a HET-noun, but since the definite article 'het' is used, it gets the -e ending: 'het mooie meisje'." },
  { article: "", adjectiveStem: "oud", adjectiveCombined: "oude", noun: "boeken", translation: "old books", isEEnding: true, explanation: "Boeken is plural. Adjectives modifying plural nouns always get the -e ending: 'oude boeken'." },
  { article: "Een", adjectiveStem: "oud", adjectiveCombined: "oude", noun: "man", translation: "an old man", isEEnding: true, explanation: "Man is a DE-noun (de man). Adjectives modifying DE-nouns get the -e ending: 'een oude man'." },
];

function getAdjectiveEnding(
  article: "definite" | "indefinite" | "none",
  noun: AdjectiveNoun,
  adj: typeof adjectiveWords[0]
) {
  const isNeuterSingularIndefinite =
    noun.gender === "het" && !noun.plural && (article === "indefinite" || article === "none");

  if (isNeuterSingularIndefinite) {
    return {
      adjective: adj.stem,
      ending: "",
      rule: `Because "${noun.word}" is a singular neuter (het) noun and is indefinite (used with "${article === 'none' ? 'no article' : 'een'}"), the adjective does NOT get an "-e" ending.`,
    };
  } else {
    return {
      adjective: adj.combined,
      ending: "e",
      rule: `Adjectives preceding a noun get an "-e" suffix in all other cases (e.g. plural nouns, common "de" nouns, or when using definite articles "de/het"). Here, "${noun.word}" takes the "-e" form "${adj.combined}".`,
    };
  }
}

interface StrongVerb {
  infinitive: string;
  translation: string;
  pastSingular: string;
  pastPlural: string;
  pastParticiple: string;
  auxiliary: "hebben" | "zijn";
  example: string;
  exampleTranslation: string;
}

const strongVerbsList: StrongVerb[] = [
  {
    infinitive: "doen",
    translation: "to do / make",
    pastSingular: "deed",
    pastPlural: "deden",
    pastParticiple: "gedaan",
    auxiliary: "hebben",
    example: "Ik heb mijn huiswerk gedaan.",
    exampleTranslation: "I have done my homework."
  },
  {
    infinitive: "gaan",
    translation: "to go",
    pastSingular: "ging",
    pastPlural: "gingen",
    pastParticiple: "gegaan",
    auxiliary: "zijn",
    example: "Wij zijn naar de winkel gegaan.",
    exampleTranslation: "We went (have gone) to the store."
  },
  {
    infinitive: "komen",
    translation: "to come",
    pastSingular: "kwam",
    pastPlural: "kwamen",
    pastParticiple: "gekomen",
    auxiliary: "zijn",
    example: "Zij is gisteren gekomen.",
    exampleTranslation: "She came (has come) yesterday."
  },
  {
    infinitive: "zien",
    translation: "to see",
    pastSingular: "zag",
    pastPlural: "zagen",
    pastParticiple: "gezien",
    auxiliary: "hebben",
    example: "Ik heb hem in de stad gezien.",
    exampleTranslation: "I saw (have seen) him in the city."
  },
  {
    infinitive: "zijn",
    translation: "to be",
    pastSingular: "was",
    pastPlural: "waren",
    pastParticiple: "geweest",
    auxiliary: "zijn",
    example: "Wij zijn in Nederland geweest.",
    exampleTranslation: "We have been to the Netherlands."
  },
  {
    infinitive: "hebben",
    translation: "to have",
    pastSingular: "had",
    pastPlural: "hadden",
    pastParticiple: "gehad",
    auxiliary: "hebben",
    example: "Ik heb gisteren veel plezier gehad.",
    exampleTranslation: "I had (have had) a lot of fun yesterday."
  },
  {
    infinitive: "nemen",
    translation: "to take",
    pastSingular: "nam",
    pastPlural: "namen",
    pastParticiple: "genomen",
    auxiliary: "hebben",
    example: "Hij heeft zijn jas genomen.",
    exampleTranslation: "He took (has taken) his coat."
  },
  {
    infinitive: "lezen",
    translation: "to read",
    pastSingular: "las",
    pastPlural: "lazen",
    pastParticiple: "gelezen",
    auxiliary: "hebben",
    example: "Zij heeft het hele boek gelezen.",
    exampleTranslation: "She read (has read) the entire book."
  },
  {
    infinitive: "drinken",
    translation: "to drink",
    pastSingular: "dronk",
    pastPlural: "dronken",
    pastParticiple: "gedronken",
    auxiliary: "hebben",
    example: "Heb je water gedronken?",
    exampleTranslation: "Did you drink (have you drunk) water?"
  },
  {
    infinitive: "schrijven",
    translation: "to write",
    pastSingular: "schreef",
    pastPlural: "schreven",
    pastParticiple: "geschreven",
    auxiliary: "hebben",
    example: "Ik heb een e-mail geschreven.",
    exampleTranslation: "I wrote (have written) an email."
  }
];

export default function GrammarSection() {
  const [activeSubTab, setActiveSubTab] = useState<TabId>("spelling");
  const [selectedStrongVerb, setSelectedStrongVerb] = useState<StrongVerb | null>(strongVerbsList[0]);

  // 1. Syllable/Spelling Interactive Tool States
  const [syllableInput, setSyllableInput] = useState("");
  const [syllableResult, setSyllableResult] = useState<{
    plural: string;
    explanation: string[];
    original: string;
  } | null>(null);

  const predefinedSyllables = [
    { word: "boot", plural: "boten", explanation: ["Add plural suffix '-en' -> 'booten'", "The syllable 'bo-' is open, so the long vowel double 'oo' is simplified to a single 'o' -> 'boten'."] },
    { word: "kat", plural: "katten", explanation: ["Add plural suffix '-en' -> 'katen'", "The vowel 'a' is short. To keep it short in an open syllable 'ka-', we double the consonant 't' -> 'katten'."] },
    { word: "brief", plural: "brieven", explanation: ["When pluralized, the ending consonant 'f' changes to a voiced 'v' -> 'brieven'."] },
    { word: "huis", plural: "huizen", explanation: ["When pluralized, the ending consonant 's' changes to a voiced 'z' -> 'huizen'."] },
  ];

  const handleSyllableCheck = (word: string) => {
    const cleanWord = word.trim().toLowerCase();
    if (!cleanWord) return;

    // Check if predefined
    const pre = predefinedSyllables.find((p) => p.word === cleanWord);
    if (pre) {
      setSyllableResult({
        original: pre.word,
        plural: pre.plural,
        explanation: pre.explanation,
      });
      return;
    }

    // Basic rule simulation
    let plural = cleanWord + "en";
    const explanations = [`Add plural suffix '-en' -> '${plural}'`];

    // ends in f -> v
    if (cleanWord.endsWith("f")) {
      const stem = cleanWord.slice(0, -1);
      plural = stem + "ven";
      explanations.push(`The ending 'f' changes to its voiced counterpart 'v' -> '${plural}'.`);
    }
    // ends in s -> z
    else if (cleanWord.endsWith("s")) {
      const stem = cleanWord.slice(0, -1);
      plural = stem + "zen";
      explanations.push(`The ending 's' changes to its voiced counterpart 'z' -> '${plural}'.`);
    }
    // check double vowels (long vowels) like aa, ee, oo, uu followed by single consonant
    else if (/[aeou]{2}[bcdfghjklmnpqrstvwxyz]$/i.test(cleanWord)) {
      const vowel = cleanWord.match(/([aeou])\1/i)?.[0];
      if (vowel) {
        const singleVowel = vowel[0];
        const lastConsonant = cleanWord.slice(-1);
        const stem = cleanWord.slice(0, -2);
        plural = stem + singleVowel + lastConsonant + "en";
        explanations.push(`The long vowel '${vowel}' is in an open syllable in the plural form, so it simplifies to a single '${singleVowel}' -> '${plural}'.`);
      }
    }
    // check short single vowel followed by single consonant (needs double consonant)
    else if (/[aeiou][bcdfghjklmnpqrstvwxyz]$/i.test(cleanWord) && !/[aeiou]{2}/.test(cleanWord)) {
      const lastConsonant = cleanWord.slice(-1);
      // Exclude some characters that don't double or behave differently
      if (!["w", "x", "y", "h"].includes(lastConsonant)) {
        plural = cleanWord + lastConsonant + "en";
        explanations.push(`The single vowel '${cleanWord.match(/[aeiou]/i)?.[0]}' is short. To preserve the short sound in the open plural syllable, we double the consonant '${lastConsonant}' -> '${plural}'.`);
      }
    }

    setSyllableResult({
      original: cleanWord,
      plural,
      explanation: explanations,
    });
  };

  // 2. 't Kofschip Conjugator States
  const [verbInput, setVerbInput] = useState("");
  const [kofschipResult, setKofschipResult] = useState<{
    infinitive: string;
    rawStem: string;
    lastLetter: string;
    inKofschip: boolean;
    ending: string;
    adjustedStem: string;
    pastSingular: string;
    pastPlural: string;
    pastParticiple: string;
  } | null>(null);

  const handleKofschipCheck = (verb: string) => {
    const inf = verb.trim().toLowerCase();
    if (!inf || !inf.endsWith("en")) {
      alert("Please enter a regular Dutch verb ending in -en (e.g., werken, spelen).");
      return;
    }

    // 1. Raw stem (remove -en)
    const rawStem = inf.slice(0, -2);
    // 2. Last letter of raw stem
    const lastLetter = rawStem.slice(-1);
    // 3. Check 't kofschip (t, k, f, s, ch, p)
    const kofschipConsonants = ["t", "k", "f", "s", "c", "h", "p"];
    const inKofschip = kofschipConsonants.includes(lastLetter);
    const ending = inKofschip ? "te" : "de";

    // 4. Adjusted stem for spelling rules
    let adjustedStem = rawStem;
    // simplify double letters at the end (e.g. bell -> bel)
    if (adjustedStem.length > 1 && adjustedStem.slice(-1) === adjustedStem.slice(-2, -1)) {
      adjustedStem = adjustedStem.slice(0, -1);
    }
    // change ending v to f, z to s (e.g. reiz -> reis, schrijf -> schrijf)
    if (adjustedStem.endsWith("z")) {
      adjustedStem = adjustedStem.slice(0, -1) + "s";
    } else if (adjustedStem.endsWith("v")) {
      adjustedStem = adjustedStem.slice(0, -1) + "f";
    }
    // double vowel if raw stem ends in vowel + consonant but infinitive has long vowel (e.g., hopen -> hop -> hoop)
    // simplistic check for single vowel followed by single consonant in stem, where infinitive had single vowel (open syllable long vowel)
    const openSyllableVowels = ["a", "e", "o", "u"];
    if (
      rawStem.length >= 2 &&
      openSyllableVowels.includes(rawStem.charAt(rawStem.length - 2)) &&
      !openSyllableVowels.includes(rawStem.slice(-1))
    ) {
      // check if it's a long vowel verb like hopen, maken, praten
      // usually, if we remove -en, mak -> stem should be maak
      const v = rawStem.charAt(rawStem.length - 2);
      // ensure it wasn't double vowel in the infinitive (already handled)
      if (inf.charAt(inf.length - 4) !== v) {
        adjustedStem = rawStem.slice(0, -2) + v + v + rawStem.slice(-1);
        if (adjustedStem.endsWith("z")) {
          adjustedStem = adjustedStem.slice(0, -1) + "s";
        } else if (adjustedStem.endsWith("v")) {
          adjustedStem = adjustedStem.slice(0, -1) + "f";
        }
      }
    }

    const pastSingular = adjustedStem + ending;
    const pastPlural = adjustedStem + ending + "n";
    // past participle: ge + adjustedStem + (inKofschip ? t : d)
    let participleEnding = inKofschip ? "t" : "d";
    // if adjustedStem already ends in t or d, don't add another one
    if (adjustedStem.endsWith("t") || adjustedStem.endsWith("d")) {
      participleEnding = "";
    }
    const pastParticiple = "ge" + adjustedStem + participleEnding;

    setKofschipResult({
      infinitive: inf,
      rawStem,
      lastLetter,
      inKofschip,
      ending,
      adjustedStem,
      pastSingular,
      pastPlural,
      pastParticiple,
    });
  };

  // 3. Word Order Game States
  const scrambledSentences = [
    {
      id: 1,
      english: "Tomorrow I go to school.",
      correct: ["morgen", "ga", "ik", "naar", "school"],
      explanation: "Inversion Rule: The sentence starts with the time indicator 'Morgen' (tomorrow), which triggers inversion. The verb 'ga' comes second, and the subject 'ik' moves to the third position.",
    },
    {
      id: 2,
      english: "I know that he is sick.",
      correct: ["ik", "weet", "dat", "hij", "ziek", "is"],
      explanation: "Subordinate Clause: The conjunction 'dat' (that) introduces a subordinate clause. In Dutch subordinate clauses, all verbs ('is') go to the very end of the clause.",
    },
    {
      id: 3,
      english: "We drink water today.",
      correct: ["we", "drinken", "vandaag", "water"],
      explanation: "Standard Word Order: Subject ('We') + Finite Verb ('drinken') + Time adverb ('vandaag') + Object ('water').",
    },
    {
      id: 4,
      english: "I want to speak Dutch.",
      correct: ["ik", "wil", "nederlands", "spreken"],
      explanation: "Auxiliary Verb: When you have an auxiliary verb ('wil' - want) and an infinitive ('spreken' - to speak), the auxiliary verb goes in the second position (SVO), and the infinitive goes to the very end of the sentence.",
    },
    {
      id: 5,
      english: "I did not do it.",
      correct: ["ik", "heb", "het", "niet", "gedaan"],
      explanation: "Negation with Past Participle: The negation 'niet' comes after the direct object pronoun 'het', but is placed directly before the final past participle 'gedaan' (done).",
    },
    {
      id: 6,
      english: "He cannot come today.",
      correct: ["hij", "kan", "vandaag", "niet", "komen"],
      explanation: "Modal Verb and Negation: The auxiliary modal verb 'kan' (can) occupies the second position. The negative 'niet' is placed after the time adverb 'vandaag' but directly before the triggered infinitive 'komen' at the very end.",
    },
    {
      id: 7,
      english: "I am not going to school.",
      correct: ["ik", "ga", "niet", "naar", "school"],
      explanation: "Negation with Prepositional Phrase: In Dutch, the negative 'niet' is placed directly before prepositional phrases (like 'naar school' - to school).",
    },
  ];

  const [currentSentenceIdx, setCurrentSentenceIdx] = useState(0);
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [gameFeedback, setGameFeedback] = useState<{ isCorrect: boolean; text: string } | null>(null);

  const currentSentence = scrambledSentences[currentSentenceIdx];
  // Stable shuffled words representation
  const [shuffledWords, setShuffledWords] = useState<string[]>(() => {
    return [...scrambledSentences[0].correct].sort(() => Math.random() - 0.5);
  });

  const handleWordClick = (word: string) => {
    if (selectedWords.includes(word)) {
      setSelectedWords(selectedWords.filter((w) => w !== word));
    } else {
      setSelectedWords([...selectedWords, word]);
    }
    setGameFeedback(null);
  };

  const checkSentence = () => {
    const isCorrect =
      selectedWords.length === currentSentence.correct.length &&
      selectedWords.every((w, idx) => w === currentSentence.correct[idx]);

    setGameFeedback({
      isCorrect,
      text: isCorrect
        ? `Correct! 🎉 ${currentSentence.explanation}`
        : "Not quite right yet. Tip: Check the verb placement rules! Try again.",
    });
  };

  const nextSentence = () => {
    const nextIdx = (currentSentenceIdx + 1) % scrambledSentences.length;
    setCurrentSentenceIdx(nextIdx);
    setSelectedWords([]);
    setGameFeedback(null);
    setShuffledWords([...scrambledSentences[nextIdx].correct].sort(() => Math.random() - 0.5));
  };

  const resetSentenceGame = () => {
    setSelectedWords([]);
    setGameFeedback(null);
    setShuffledWords([...currentSentence.correct].sort(() => Math.random() - 0.5));
  };

  // 4. Articles Noun Quiz States
  const quizNouns = [
    { noun: "meisje", article: "het", rule: "All diminutive nouns ending in '-je' are 'het' words." },
    { noun: "boek", article: "het", rule: "No simple rule. Must be memorized. Most metal, paper, and physical materials are 'het'." },
    { noun: "bomen", article: "de", rule: "All plural nouns in Dutch take the article 'de'." },
    { noun: "bakkerij", article: "de", rule: "Nouns ending in '-erij', '-ing', '-heid', and '-teit' are always 'de' words." },
    { noun: "huis", article: "het", rule: "No simple rule, must be memorized." },
    { noun: "tafel", article: "de", rule: "No simple rule, must be memorized." },
    { noun: "kind", article: "het", rule: "No simple rule, must be memorized." },
    { noun: "politie", article: "de", rule: "Words ending in '-tie' are always 'de' words." },
  ];

  const [currentQuizIdx, setCurrentQuizIdx] = useState(0);
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);
  const [quizFeedback, setQuizFeedback] = useState<string | null>(null);
  const [quizScore, setQuizScore] = useState(0);

  const currentQuizItem = quizNouns[currentQuizIdx];

  const handleAnswerArticle = (answer: "de" | "het") => {
    if (selectedArticle) return; // already answered
    setSelectedArticle(answer);
    const isCorrect = answer === currentQuizItem.article;
    if (isCorrect) {
      setQuizScore(quizScore + 1);
      setQuizFeedback(`Correct! 🎉 ${currentQuizItem.rule}`);
    } else {
      setQuizFeedback(`Wrong. The correct article is "${currentQuizItem.article}". ${currentQuizItem.rule}`);
    }
  };

  const nextQuizItem = () => {
    setSelectedArticle(null);
    setQuizFeedback(null);
    setCurrentQuizIdx((currentQuizIdx + 1) % quizNouns.length);
  };
 
  // 5. Phonetics & Ear Training Game States
  const earTrainingPairs = [
    { word1: "maan", word2: "man", translation1: "moon", translation2: "man", hint: "Maan has a long open 'aa' (as in English 'father'). Man has a short lax 'a' (like 'cap' or British 'cut').", category: "vowels" },
    { word1: "hout", word2: "huid", translation1: "wood", translation2: "skin", hint: "Hout uses 'ou', sounding like English 'ow' in 'how'. Huid uses the unique Dutch rounded front vowel 'ui' (French 'oeil').", category: "diphthongs" },
    { word1: "beer", word2: "peer", translation1: "bear", translation2: "pear", hint: "Beer starts with a voiced 'b'. Peer starts with a voiceless unaspirated 'p'.", category: "consonants" },
    { word1: "beer", word2: "veer", translation1: "bear", translation2: "feather", hint: "Beer starts with 'b'. Veer starts with a voiced 'v' (often slightly voiceless in Dutch).", category: "consonants" },
    { word1: "bol", word2: "wol", translation1: "sphere / bulb", translation2: "wool", hint: "Bol starts with 'b'. Wol starts with the Dutch 'w' (touch teeth to bottom lip lightly).", category: "consonants" },
    { word1: "dak", word2: "tak", translation1: "roof", translation2: "branch", hint: "Dak starts with 'd'. Tak starts with 't' (unaspirated, no puff of air).", category: "consonants" },
    { word1: "peen", word2: "pen", translation1: "carrot", translation2: "pen", hint: "Peen has the long tense 'ee' (ay) sound. Pen has the short lax 'e' (as in 'pet').", category: "vowels" },
    { word1: "peen", word2: "pijn", translation1: "carrot", translation2: "pain", hint: "Peen has the long 'ee' (ay) sound. Pijn has the diphthong 'ijn' (English 'y' in 'why').", category: "diphthongs" },
    { word1: "pet", word2: "pit", translation1: "cap", translation2: "seed / pit", hint: "Pet has the short 'e' sound. Pit has the short 'i' sound (like English 'sit').", category: "vowels" },
    { word1: "veulen", word2: "vullen", translation1: "foal", translation2: "to fill", hint: "Veulen has the long rounded 'eu' (French 'eu'). Vullen has the short lax 'u' (like 'sir').", category: "vowels" },
    { word1: "goud", word2: "hout", translation1: "gold", translation2: "wood", hint: "Goud starts with the voiced guttural 'g' (throat friction). Hout starts with 'h'.", category: "consonants" },
    { word1: "geel", word2: "keel", translation1: "yellow", translation2: "throat", hint: "Geel starts with the voiced guttural 'g'. Keel starts with the voiceless stop 'k'.", category: "consonants" },
    { word1: "vies", word2: "vis", translation1: "dirty", translation2: "fish", hint: "Vies has the long tense 'ie' (ee). Vis has the short lax 'i' (sit).", category: "vowels" },
    { word1: "fluit", word2: "fruit", translation1: "whistle / flute", translation2: "fruit", hint: "Fluit starts with 'fl-'. Fruit starts with 'fr-' (with guttural or rolled r).", category: "consonants" },
    { word1: "kam", word2: "kan", translation1: "comb", translation2: "pitcher / can", hint: "Kam ends in 'm' (lips closed). Kan ends in 'n' (lips open).", category: "consonants" },
    { word1: "moer", word2: "muur", translation1: "nut (metal)", translation2: "wall", hint: "Moer has the 'oe' (oo) sound. Muur has the long rounded 'uu' (French 'u').", category: "vowels" },
    { word1: "rook", word2: "rok", translation1: "smoke", translation2: "skirt", hint: "Rook has the long tense 'oo' sound. Rok has the short open 'o' sound (like 'pot').", category: "vowels" },
    { word1: "wol", word2: "vol", translation1: "wool", translation2: "full", hint: "Wol starts with the soft approximant 'w'. Vol starts with the voiced fricative 'v' (sounding near 'f').", category: "consonants" }
  ];

  const phoneticWordCards: PhoneticCard[] = [
    { type: "pair", word1: "maan", highlight1: "aa", translation1: "moon", word2: "man", highlight2: "a", translation2: "man", explanation: "Long 'aa' vs. Short 'a'. 'Maan' is a long open vowel (like 'father'). 'Man' is short and lax (like the vowel in 'cap' or British 'cut').", category: "vowels" },
    { type: "pair", word1: "hout", highlight1: "ou", translation1: "wood", word2: "huid", highlight2: "ui", translation2: "skin", explanation: "Diphthong 'ou' vs. 'ui'. 'Hout' sounds like English 'how'. 'Huid' uses the unique Dutch rounded front vowel (French 'oeil' or German 'ö').", category: "diphthongs" },
    { type: "pair", word1: "beer", highlight1: "b", translation1: "bear", word2: "peer", highlight2: "p", translation2: "pear", explanation: "Voiced 'b' vs. Voiceless 'p'. Dutch 'p' is not aspirated (no puff of air), which makes it sound closer to 'b' for English speakers.", category: "consonants" },
    { type: "pair", word1: "beer", highlight1: "b", translation1: "bear", word2: "veer", highlight2: "v", translation2: "feather", explanation: "Voiced 'b' vs. Voiced 'v'. Note that Dutch 'v' is often slightly voiceless, sounding between English 'v' and 'f'.", category: "consonants" },
    { type: "pair", word1: "bol", highlight1: "b", translation1: "sphere / bulb", word2: "wol", highlight2: "w", translation2: "wool", explanation: "Consonant 'b' vs. 'w'. The Dutch 'w' is made by touching your upper teeth to your lower lip lightly (approximant), while 'b' is bilabial.", category: "consonants" },
    { type: "pair", word1: "dak", highlight1: "d", translation1: "roof", word2: "tak", highlight2: "t", translation2: "branch", explanation: "Voiced 'd' vs. Voiceless 't'. Like 'p', the Dutch 't' is not aspirated.", category: "consonants" },
    { type: "pair", word1: "peen", highlight1: "ee", translation1: "carrot", word2: "pen", highlight2: "e", translation2: "pen", explanation: "Long 'ee' vs. Short 'e'. 'Peen' is a long tense 'ay' vowel. 'Pen' is a short lax vowel like in English 'pet'.", category: "vowels" },
    { type: "pair", word1: "peen", highlight1: "ee", translation1: "carrot", word2: "pijn", highlight2: "ijn", translation2: "pain", explanation: "Long 'ee' vs. Diphthong 'ijn'. 'Pijn' ends with the diphthong sound like English 'y' in 'why'.", category: "diphthongs" },
    { type: "pair", word1: "pet", highlight1: "e", translation1: "cap", word2: "pit", highlight2: "i", translation2: "seed / pit", explanation: "Short 'e' vs. Short 'i'. In Dutch, the 'i' sound in 'pit' is a short lax vowel, similar to English 'sit' but slightly closer to 'uh'.", category: "vowels" },
    { type: "pair", word1: "veulen", highlight1: "eu", translation1: "foal", word2: "vullen", highlight2: "u", translation2: "to fill", explanation: "Diphthong 'eu' vs. Short 'u'. 'Veulen' uses the long rounded 'eu' (French 'eu'). 'Vullen' uses the short lax 'u' (like 'sir').", category: "vowels" },
    { type: "pair", word1: "goud", highlight1: "g", translation1: "gold", word2: "hout", highlight2: "h", translation2: "wood", explanation: "Voiced guttural 'g' vs. 'h'. The Dutch 'g' is a throat friction sound (voiced velar fricative). 'H' is breathy.", category: "consonants" },
    { type: "pair", word1: "geel", highlight1: "g", translation1: "yellow", word2: "keel", highlight2: "k", translation2: "throat", explanation: "Voiced guttural 'g' vs. Voiceless guttural 'k'. Compare the friction in 'g' with the sharp stop in 'k'.", category: "consonants" },
    { type: "pair", word1: "vies", highlight1: "ie", translation1: "dirty", word2: "vis", highlight2: "i", translation2: "fish", explanation: "Long 'ie' vs. Short 'i'. 'Vies' uses the long 'ee' sound (like English 'feet'). 'Vis' is short and lax (like English 'sit' or 'fish').", category: "vowels" },
    { type: "pair", word1: "fluit", highlight1: "fl", translation1: "whistle / flute", word2: "fruit", highlight2: "fr", translation2: "fruit", explanation: "Consonant cluster 'fl-' vs. 'fr-'. Practice transitioning smoothly from 'f' to 'l' vs. 'r' (which is voiced in the throat or rolled).", category: "consonants" },
    { type: "pair", word1: "kam", highlight1: "m", translation1: "comb", word2: "kan", highlight2: "n", translation2: "pitcher / can", explanation: "Ending sound 'm' vs. 'n'. Keep the lips closed for 'm' and open against the teeth for 'n'.", category: "consonants" },
    { type: "pair", word1: "moer", highlight1: "oe", translation1: "nut (metal)", word2: "muur", highlight2: "uu", translation2: "wall", explanation: "Vowel 'oe' vs. 'uu'. 'Moer' has the 'oo' sound of English 'boot'. 'Muur' is the long front rounded 'y' sound (like French 'u' or German 'ü').", category: "vowels" },
    { type: "pair", word1: "rook", highlight1: "oo", translation1: "smoke", word2: "rok", highlight2: "o", translation2: "skirt", explanation: "Long 'oo' vs. Short 'o'. 'Rook' has a long tense 'oh' sound. 'Rok' has a short open 'o' sound like in English 'pot'.", category: "vowels" },
    { type: "pair", word1: "wol", highlight1: "w", translation1: "wool", word2: "vol", highlight2: "v", translation2: "full", explanation: "Approximant 'w' vs. Fricative 'v'. Touch upper teeth to bottom lip lightly without friction for 'w', but apply friction (closer to 'f') for 'v'.", category: "consonants" },
    { type: "single", word1: "kinderen", highlight1: "i", translation1: "children", explanation: "Plural of 'kind' (child). Note that in the singular 'kind', the vowel is somewhat longer, but in the plural 'kinderen', the first syllable 'kin-' is short and lax.", category: "vowels" }
  ];

  const [phoneticSearch, setPhoneticSearch] = useState("");
  const [lastSpeechText, setLastSpeechText] = useState("");
  const [useSlowSpeech, setUseSlowSpeech] = useState(false);
  const [phoneticsMode, setPhoneticsMode] = useState<"study" | "quiz">("study");
  const [isPlayingBoth, setIsPlayingBoth] = useState<string | null>(null);

  // User friendly phonetics state
  const [phoneticsCategory, setPhoneticsCategory] = useState<"all" | "vowels" | "diphthongs" | "consonants">("all");
  const [quizCategory, setQuizCategory] = useState<"all" | "vowels" | "diphthongs" | "consonants">("all");
  const [activeSpokenWord, setActiveSpokenWord] = useState<string | null>(null);
  const [quizHistory, setQuizHistory] = useState<boolean[]>([]);

  const [earTrainingQuestion, setEarTrainingQuestion] = useState<{
    word1: string;
    word2: string;
    translation1: string;
    translation2: string;
    correct: string;
    hint: string;
  } | null>(null);
  const [selectedWordAnswer, setSelectedWordAnswer] = useState<string | null>(null);
  const [earFeedback, setEarFeedback] = useState<string | null>(null);
  const [earScore, setEarScore] = useState(0);
  const [earTotal, setEarTotal] = useState(0);

  const startNewEarTraining = (cat?: "all" | "vowels" | "diphthongs" | "consonants") => {
    const targetCat = cat || quizCategory;
    const filtered = targetCat === "all"
      ? earTrainingPairs
      : earTrainingPairs.filter((p) => p.category === targetCat);

    if (filtered.length === 0) {
      setEarTrainingQuestion(null);
      setSelectedWordAnswer(null);
      setEarFeedback("No training pairs found for this category.");
      return;
    }

    const pair = filtered[Math.floor(Math.random() * filtered.length)];
    const chooseWord1 = Math.random() < 0.5;
    const correct = chooseWord1 ? pair.word1 : pair.word2;

    setEarTrainingQuestion({
      word1: pair.word1,
      word2: pair.word2,
      translation1: pair.translation1,
      translation2: pair.translation2,
      correct,
      hint: pair.hint,
    });
    setSelectedWordAnswer(null);
    setEarFeedback(null);
    setLastSpeechText(correct);
    setUseSlowSpeech(false);
    
    // Play sound initially
    setActiveSpokenWord(correct);
    speakDutch(correct, 0.6);
    setTimeout(() => {
      setActiveSpokenWord((prev) => (prev === correct ? null : prev));
    }, 1000);
  };

  const handleAnswerEar = (answer: string) => {
    if (selectedWordAnswer || !earTrainingQuestion) return;
    setSelectedWordAnswer(answer);
    setEarTotal(earTotal + 1);
    const isCorrect = answer === earTrainingQuestion.correct;
    if (isCorrect) {
      setEarScore(earScore + 1);
      setEarFeedback(`Correct! 🎉 You heard "${earTrainingQuestion.correct}".`);
      setQuizHistory((prev) => [...prev.slice(-9), true]);
    } else {
      setEarFeedback(`Wrong. You actually heard "${earTrainingQuestion.correct}".`);
      setQuizHistory((prev) => [...prev.slice(-9), false]);
    }
  };

  const playMysterySound = (forceSlow?: boolean) => {
    if (!earTrainingQuestion) {
      startNewEarTraining();
    } else {
      let speakSlow = false;
      if (forceSlow !== undefined) {
        speakSlow = forceSlow;
      } else if (earTrainingQuestion.correct === lastSpeechText) {
        speakSlow = !useSlowSpeech;
      }
      setLastSpeechText(earTrainingQuestion.correct);
      setUseSlowSpeech(speakSlow);
      setActiveSpokenWord(earTrainingQuestion.correct);
      speakDutch(earTrainingQuestion.correct, speakSlow ? 0.35 : 0.6);
      setTimeout(() => {
        setActiveSpokenWord((prev) => (prev === earTrainingQuestion.correct ? null : prev));
      }, 1000);
    }
  };

  const handleAudioSpeak = (text: string, forceSlow?: boolean) => {
    let speakSlow = false;
    if (forceSlow !== undefined) {
      speakSlow = forceSlow;
    } else if (text === lastSpeechText) {
      speakSlow = !useSlowSpeech;
    }
    setLastSpeechText(text);
    setUseSlowSpeech(speakSlow);
    setActiveSpokenWord(text);
    speakDutch(text, speakSlow ? 0.35 : 0.6);
    setTimeout(() => {
      setActiveSpokenWord((prev) => (prev === text ? null : prev));
    }, 1000);
  };

  const handlePlayBoth = async (w1: string, w2: string, cardId: string) => {
    setIsPlayingBoth(cardId);
    setActiveSpokenWord(w1);
    speakDutch(w1, 0.6);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    setActiveSpokenWord(w2);
    speakDutch(w2, 0.6);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    setActiveSpokenWord(null);
    setIsPlayingBoth(null);
  };

  // 6. Adjective Ending States & Handlers
  const [adjectiveMode, setAdjectiveMode] = useState<"builder" | "quiz">("builder");
  const [selectedBuilderArticle, setSelectedBuilderArticle] = useState<"definite" | "indefinite" | "none">("definite");
  const [selectedBuilderNounIdx, setSelectedBuilderNounIdx] = useState(0);
  const [selectedBuilderAdjectiveIdx, setSelectedBuilderAdjectiveIdx] = useState(0);

  const [adjectiveQuizIdx, setAdjectiveQuizIdx] = useState(0);
  const [selectedAdjectiveAnswer, setSelectedAdjectiveAnswer] = useState<boolean | null>(null);
  const [adjectiveQuizScore, setAdjectiveQuizScore] = useState(0);
  const [adjectiveQuizTotal, setAdjectiveQuizTotal] = useState(0);
  const [adjectiveFeedback, setAdjectiveFeedback] = useState<string | null>(null);

  const startNewAdjectiveQuiz = () => {
    setSelectedAdjectiveAnswer(null);
    setAdjectiveFeedback(null);
    setAdjectiveQuizIdx(Math.floor(Math.random() * adjectiveQuizQuestions.length));
  };

  const handleAnswerAdjective = (answer: boolean) => {
    if (selectedAdjectiveAnswer !== null) return;
    setSelectedAdjectiveAnswer(answer);
    setAdjectiveQuizTotal((prev) => prev + 1);
    const question = adjectiveQuizQuestions[adjectiveQuizIdx];
    const isCorrect = answer === question.isEEnding;
    if (isCorrect) {
      setAdjectiveQuizScore((prev) => prev + 1);
      setAdjectiveFeedback(`Correct! 🎉 ${question.explanation}`);
    } else {
      setAdjectiveFeedback(`Incorrect. ${question.explanation}`);
    }
  };

  const nextAdjectiveQuiz = () => {
    setSelectedAdjectiveAnswer(null);
    setAdjectiveFeedback(null);
    setAdjectiveQuizIdx((prev) => (prev + 1) % adjectiveQuizQuestions.length);
  };

  return (
    <section className="rounded-2xl bg-white p-6 shadow">
      <h2 className="text-xl font-bold flex items-center gap-2">
        🇳🇱 Dutch Grammar & Spelling Guide
      </h2>
      <p className="mt-1 text-sm text-gray-655 mb-6">
        Master essential spelling patterns, verb conjugation shortcuts, word order mechanics, and gender articles.
      </p>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto select-none">
        <button
          className={`pb-3 px-4 font-semibold text-sm border-b-2 transition-colors whitespace-nowrap ${
            activeSubTab === "spelling"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}
          onClick={() => setActiveSubTab("spelling")}
        >
          Spelling & Syllables
        </button>
        <button
          className={`pb-3 px-4 font-semibold text-sm border-b-2 transition-colors whitespace-nowrap ${
            activeSubTab === "verbs"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}
          onClick={() => setActiveSubTab("verbs")}
        >
          Verb Conjugation ('t kofschip)
        </button>
        <button
          className={`pb-3 px-4 font-semibold text-sm border-b-2 transition-colors whitespace-nowrap ${
            activeSubTab === "word-order"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}
          onClick={() => setActiveSubTab("word-order")}
        >
          Word Order Game
        </button>
        <button
          className={`pb-3 px-4 font-semibold text-sm border-b-2 transition-colors whitespace-nowrap ${
            activeSubTab === "articles"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}
          onClick={() => setActiveSubTab("articles")}
        >
          De vs. Het Noun Quiz
        </button>
        <button
          className={`pb-3 px-4 font-semibold text-sm border-b-2 transition-colors whitespace-nowrap ${
            activeSubTab === "phonetics"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}
          onClick={() => setActiveSubTab("phonetics")}
        >
          Phonetics & Sounds
        </button>
        <button
          className={`pb-3 px-4 font-semibold text-sm border-b-2 transition-colors whitespace-nowrap ${
            activeSubTab === "adjectives"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}
          onClick={() => setActiveSubTab("adjectives")}
        >
          Adjective Endings (-e)
        </button>
      </div>

      {/* Tab 1: Spelling & Syllables */}
      {activeSubTab === "spelling" && (
        <div className="space-y-6 text-left">
          <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-4 text-sm text-blue-900">
            <h3 className="font-bold text-blue-950 mb-1">The Golden Dutch Spelling Rules</h3>
            <p className="leading-relaxed">
              Dutch spelling is highly phonetic and revolves around maintaining vowel length (long vs. short).
              When a word is pluralized or conjugated, syllable boundaries change, which triggers vowel or consonant adjustments.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Rule card 1 */}
            <div className="border border-gray-150 rounded-xl p-4 bg-gray-50/50">
              <h4 className="font-bold text-sm text-gray-800">1. Open vs. Closed Syllables</h4>
              <ul className="mt-2 space-y-2 text-xs text-gray-650 list-disc list-inside">
                <li>
                  <strong className="text-gray-900">Closed Syllable:</strong> Ends in a consonant. Vowels are naturally short (e.g., <span className="italic font-medium">kat</span>).
                </li>
                <li>
                  <strong className="text-gray-900">Open Syllable:</strong> Ends in a vowel. Vowels are naturally long (e.g., <span className="italic font-medium">ka-ten</span> would sound long, so we write <span className="italic font-bold">katten</span> to keep it short).
                </li>
                <li>
                  <strong className="text-gray-900">Double Vowels:</strong> If a syllable is closed and has a long vowel, it needs double letters (e.g., <span className="italic font-bold">boot</span>). If it becomes open, one vowel drops because a single vowel is already long in an open syllable (e.g., <span className="italic font-bold">bo-ten</span>).
                </li>
              </ul>
            </div>

            {/* Rule card 2 */}
            <div className="border border-gray-150 rounded-xl p-4 bg-gray-50/50">
              <h4 className="font-bold text-sm text-gray-800">2. Ending Consonants (v ➔ f, z ➔ s)</h4>
              <ul className="mt-2 space-y-2 text-xs text-gray-650 list-disc list-inside">
                <li>
                  Dutch words cannot end with a <span className="font-bold text-gray-900">v</span> or a <span className="font-bold text-gray-900">z</span>.
                </li>
                <li>
                  When a verb is conjugated in the singular (or stem form), <span className="font-bold text-gray-900">v</span> changes to <span className="font-bold text-gray-900">f</span>, and <span className="font-bold text-gray-900">z</span> changes to <span className="font-bold text-gray-900">s</span>.
                </li>
                <li>
                  <span className="font-semibold text-gray-900">Examples:</span>
                  <ul className="pl-4 mt-1 space-y-1 list-none">
                    <li>• <span className="italic">schrij<b>v</b>en</span> (to write) ➔ <span className="italic font-semibold">ik schrij<b>f</b></span></li>
                    <li>• <span className="italic">le<b>z</b>en</span> (to read) ➔ <span className="italic font-semibold">ik lee<b>s</b></span></li>
                  </ul>
                </li>
              </ul>
            </div>
          </div>

          {/* Interactive Syllable Sandbox */}
          <div className="border border-orange-200 bg-orange-50/30 rounded-xl p-5">
            <h4 className="font-bold text-sm text-orange-950 flex items-center gap-1.5">
              💡 Syllable & Plural Spelling Visualizer
            </h4>
            <p className="text-xs text-orange-800 mt-1 mb-4">
              Enter a singular Dutch noun/adjective to see how open/closed syllable spelling rules create its plural form, or click one of the examples.
            </p>

            <div className="flex gap-2 mb-4 flex-wrap">
              {predefinedSyllables.map((item) => (
                <button
                  key={item.word}
                  type="button"
                  className="px-3 py-1 bg-white hover:bg-orange-100 border border-orange-200 text-xs font-semibold text-orange-900 rounded-lg shadow-sm transition active:scale-95"
                  onClick={() => {
                    setSyllableInput(item.word);
                    handleSyllableCheck(item.word);
                  }}
                >
                  {item.word} ➔ {item.plural}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={syllableInput}
                onChange={(e) => setSyllableInput(e.target.value)}
                placeholder="Type a singular noun (e.g. boom, bed, brief)..."
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-xs focus:border-gray-950 focus:outline-none bg-white"
              />
              <button
                type="button"
                onClick={() => handleSyllableCheck(syllableInput)}
                className="bg-gray-900 text-white rounded-lg px-4 py-2 text-xs font-semibold hover:bg-gray-800 transition active:scale-95"
              >
                Visualize Plural
              </button>
            </div>

            {syllableResult && (
              <div className="mt-4 bg-white border border-orange-200/80 rounded-lg p-4 animate-fade-in text-left">
                <div className="flex justify-between items-center mb-2">
                  <div className="text-xs text-gray-500">
                    Singular: <span className="font-bold text-gray-900">{syllableResult.original}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    Plural: <span className="font-bold text-green-700">{syllableResult.plural}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAudioSpeak(syllableResult.plural)}
                    className="p-1 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 text-sm active:scale-95"
                    title="Listen to plural pronunciation"
                  >
                    🔊
                  </button>
                </div>
                <div className="border-t border-gray-100 pt-2.5 space-y-2">
                  {syllableResult.explanation.map((step, idx) => (
                    <div key={idx} className="flex gap-2 items-start text-xs text-gray-700">
                      <span className="font-bold text-orange-600 shrink-0">Step {idx + 1}:</span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Verb Conjugation & 't Kofschip */}
      {activeSubTab === "verbs" && (
        <div className="space-y-6 text-left">
          <div className="bg-orange-50/40 border border-orange-100 rounded-xl p-4 text-sm text-orange-900">
            <h3 className="font-bold text-orange-950 mb-1">What is 't Kofschip?</h3>
            <p className="leading-relaxed">
              In Dutch, weak verbs form their past tense with either <span className="font-bold">-te(n)</span> or <span className="font-bold">-de(n)</span>.
              To find out which one to use, look at the <strong>stem of the infinitive</strong> (the verb minus the <span className="italic font-semibold">-en</span> suffix).
              If the last letter of that raw stem is a consonant in the word <strong className="text-orange-950 font-extrabold">'T KOFSCHIP</strong> (t, k, f, s, ch, p), we use <strong>-te</strong>. Otherwise, we use <strong>-de</strong>.
            </p>
          </div>

          {/* Interactive Conjugator */}
          <div className="border border-gray-200 bg-gray-50/60 rounded-xl p-5">
            <h4 className="font-bold text-sm text-gray-800 flex items-center gap-1.5 mb-2">
              🛠️ Interactive 't Kofschip past tense checker
            </h4>
            <p className="text-xs text-gray-650 mb-4">
              Enter any regular Dutch verb ending in <span className="font-semibold">-en</span> to calculate its stem, test it against the rule, and generate its past tense and past participle.
            </p>

            <div className="flex gap-2 mb-3 flex-wrap">
              {["werken", "spelen", "hopen", "reizen", "maken", "passen"].map((v) => (
                <button
                  key={v}
                  type="button"
                  className="px-2.5 py-1 bg-white hover:bg-gray-100 border border-gray-200 text-xs font-medium text-gray-700 rounded-lg transition active:scale-95"
                  onClick={() => {
                    setVerbInput(v);
                    handleKofschipCheck(v);
                  }}
                >
                  {v}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={verbInput}
                onChange={(e) => setVerbInput(e.target.value)}
                placeholder="Enter infinitive (e.g. praten, koken, luisteren)..."
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-xs focus:border-gray-950 focus:outline-none bg-white"
              />
              <button
                type="button"
                onClick={() => handleKofschipCheck(verbInput)}
                className="bg-gray-900 text-white rounded-lg px-4 py-2 text-xs font-semibold hover:bg-gray-800 transition active:scale-95"
              >
                Conjugate
              </button>
            </div>

            {kofschipResult && (
              <div className="mt-4 bg-white border border-gray-200 rounded-xl p-4 animate-fade-in">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-gray-400 font-semibold block uppercase tracking-wider text-[10px]">Infinitive</span>
                    <span className="text-sm font-bold text-gray-900">{kofschipResult.infinitive}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 font-semibold block uppercase tracking-wider text-[10px]">Raw Stem (-en)</span>
                    <span className="text-sm font-semibold text-gray-700">
                      {kofschipResult.rawStem} (ends in <strong className="text-orange-600">"{kofschipResult.lastLetter}"</strong>)
                    </span>
                  </div>
                </div>

                <div className="my-3 border-t border-gray-100 pt-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      kofschipResult.inKofschip ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"
                    }`}>
                      {kofschipResult.inKofschip ? "IN 'T KOFSCHIP" : "NOT IN 'T KOFSCHIP"}
                    </span>
                    <span className="text-xs text-gray-700">
                      So the past suffix is <strong className="font-bold">-{kofschipResult.ending}</strong>.
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Spelling stem adjustment: <span className="font-semibold text-gray-800">"{kofschipResult.rawStem}"</span> ➔ <span className="font-semibold text-gray-800">"{kofschipResult.adjustedStem}"</span> (handles v➔f, z➔s, vowel doubling, and double letter simplifications).
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-3 border border-gray-150 grid grid-cols-3 gap-2 text-center text-xs mt-3">
                  <div>
                    <span className="text-gray-400 block text-[9px] font-semibold uppercase tracking-wider">Past Singular</span>
                    <span className="font-bold text-gray-950">{kofschipResult.pastSingular}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[9px] font-semibold uppercase tracking-wider">Past Plural</span>
                    <span className="font-bold text-gray-950">{kofschipResult.pastPlural}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[9px] font-semibold uppercase tracking-wider">Past Participle</span>
                    <span className="font-bold text-green-700">{kofschipResult.pastParticiple}</span>
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleAudioSpeak(kofschipResult.pastParticiple)}
                    className="flex items-center gap-1 text-xs text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition active:scale-95"
                  >
                    🔊 Hear Participle
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Strong & Irregular Verbs */}
          <div className="border border-gray-200 bg-gray-50/60 rounded-xl p-5">
            <h4 className="font-bold text-sm text-gray-800 flex items-center gap-1.5 mb-2">
              🏃‍♂️ Strong & Irregular Verbs Explorer
            </h4>
            <p className="text-xs text-gray-600 mb-4">
              Unlike weak verbs, strong verbs change their stem vowel in the past tense and end in <strong>-en</strong> in the past participle (e.g. <em>doen ➔ gedaan</em>, <em>gaan ➔ gegaan</em>). Click any verb to see its past forms:
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
              {strongVerbsList.map((sv) => (
                <button
                  key={sv.infinitive}
                  type="button"
                  onClick={() => setSelectedStrongVerb(sv)}
                  className={`px-3 py-2 border rounded-xl text-xs font-semibold transition active:scale-95 text-center flex flex-col items-center justify-center ${
                    selectedStrongVerb?.infinitive === sv.infinitive
                      ? "bg-gray-900 border-gray-900 text-white"
                      : "bg-white border-gray-200 text-gray-800 hover:bg-gray-50"
                  }`}
                >
                  <span className="font-bold text-sm">{sv.infinitive}</span>
                  <span className="opacity-70 text-[10px] mt-0.5">{sv.translation}</span>
                </button>
              ))}
            </div>

            {selectedStrongVerb && (
              <div className="bg-white border border-gray-200 rounded-xl p-4 animate-fade-in space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-gray-400 font-semibold block uppercase tracking-wider text-[9px]">Infinitive</span>
                    <span className="text-sm font-bold text-gray-900">{selectedStrongVerb.infinitive}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 font-semibold block uppercase tracking-wider text-[9px]">Past Singular</span>
                    <span className="text-sm font-semibold text-gray-800">{selectedStrongVerb.pastSingular}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 font-semibold block uppercase tracking-wider text-[9px]">Past Plural</span>
                    <span className="text-sm font-semibold text-gray-800">{selectedStrongVerb.pastPlural}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 font-semibold block uppercase tracking-wider text-[9px]">Past Participle</span>
                    <span className="text-sm font-bold text-green-700">
                      {selectedStrongVerb.pastParticiple}
                    </span>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-gray-400 font-semibold block uppercase tracking-wider text-[9px]">Auxiliary Verb</span>
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold mt-0.5 ${
                      selectedStrongVerb.auxiliary === "zijn" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"
                    }`}>
                      {selectedStrongVerb.auxiliary.toUpperCase()}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => speakDutch(selectedStrongVerb.pastParticiple)}
                    className="flex items-center gap-1 text-xs text-blue-700 bg-blue-50 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 transition active:scale-95"
                  >
                    🔊 Hear Participle
                  </button>
                </div>

                <div className="pt-2.5 border-t border-gray-100 bg-gray-50/50 rounded-lg p-2.5 text-xs">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-gray-400 font-semibold block uppercase tracking-wider text-[9px] mb-1">Example Sentence</span>
                      <p className="font-bold text-gray-900">{selectedStrongVerb.example}</p>
                      <p className="text-gray-650 italic mt-0.5">{selectedStrongVerb.exampleTranslation}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => speakDutch(selectedStrongVerb.example)}
                      className="text-gray-500 hover:text-gray-900 p-1 active:scale-90 transition"
                      aria-label="Hear example sentence"
                    >
                      🔊
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Hebben vs. Zijn auxiliary verb rules */}
          <div className="bg-purple-50/30 border border-purple-100 rounded-xl p-4 text-xs text-purple-950 space-y-2">
            <h4 className="font-bold text-purple-900 flex items-center gap-1.5">
              💡 How to choose the auxiliary verb: Hebben vs. Zijn
            </h4>
            <p className="leading-relaxed">
              When forming the perfect tense (e.g. <em>I have worked</em> ➔ <em>Ik heb gewerkt</em>), Dutch uses two auxiliary verbs: <strong>hebben</strong> (to have) or <strong>zijn</strong> (to be).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <div className="bg-white/80 rounded-lg p-3 border border-purple-200/50">
                <span className="font-bold text-blue-800 block mb-1">Use HEBBEN for:</span>
                <ul className="list-disc pl-4 space-y-1 text-gray-700 leading-normal">
                  <li>Transitive verbs that take a direct object (e.g. <em>kopen</em>, <em>lezen</em>).</li>
                  <li>Intransitive verbs that describe an action with no change of state/location (e.g. <em>werken</em>, <em>slapen</em>).</li>
                  <li>Reflexive verbs (e.g. <em>zich wassen</em>).</li>
                </ul>
              </div>
              <div className="bg-white/80 rounded-lg p-3 border border-purple-200/50">
                <span className="font-bold text-purple-800 block mb-1">Use ZIJN for:</span>
                <ul className="list-disc pl-4 space-y-1 text-gray-700 leading-normal">
                  <li>Movement verbs indicating a change of location/direction (e.g. <em>gaan</em>, <em>komen</em>, <em>vertrekken</em>).</li>
                  <li>Verbs indicating a change of state (e.g. <em>worden</em>, <em>blijven</em>, <em>sterven</em>, <em>groeien</em>).</li>
                  <li>Specific verbs like <em>zijn</em> (to be) itself (e.g. <em>ik ben geweest</em>).</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Word Order Game */}
      {activeSubTab === "word-order" && (
        <div className="space-y-6 text-left">
          <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-4 text-sm text-blue-900">
            <h3 className="font-bold text-blue-950 mb-1">Dutch Sentence Word Order</h3>
            <p className="leading-relaxed">
              Unlike English, Dutch has strict rules regarding verb placement. In main clauses, the finite verb is <strong>always the second element</strong>.
              If the sentence begins with anything else (like time or place), the subject moves after the verb (called <strong>inversion</strong>).
              In subordinate clauses, all verbs go to the <strong>very end</strong>.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Negation Rules */}
            <div className="bg-red-50/30 border border-red-100 rounded-xl p-4 text-xs text-red-950 space-y-2">
              <h4 className="font-bold text-red-900 flex items-center gap-1">
                🚫 Negation Placement (Niet vs. Geen)
              </h4>
              <p className="leading-relaxed">
                Dutch has two main negative words: <strong>geen</strong> and <strong>niet</strong>.
              </p>
              <ul className="list-disc pl-4 space-y-1 text-gray-700 leading-normal">
                <li>
                  <strong className="text-red-900">Geen:</strong> Used to negate indefinite nouns (nouns preceded by <em>een</em> or no article).
                  <br />
                  <span className="italic text-gray-500">Example: Ik heb <strong>geen</strong> fiets. (I have no bicycle.)</span>
                </li>
                <li>
                  <strong className="text-red-900">Niet:</strong> Used to negate verbs, adjectives, adverbs, pronouns, and definite nouns (preceded by <em>de/het</em> or a possessive).
                  <br />
                  <span className="italic text-gray-500">Example: Ik zie de man <strong>niet</strong>. (I do not see the man.)</span>
                </li>
              </ul>
              <div className="pt-2 border-t border-red-100">
                <span className="font-bold text-red-900 block mb-1">Where does "niet" go?</span>
                <p className="leading-normal text-gray-700">
                  When negating a whole sentence, <strong>niet</strong> usually goes towards the end of the sentence, but it is placed <strong>directly before</strong>:
                </p>
                <ul className="list-disc pl-4 mt-1 space-y-1 text-gray-750">
                  <li>Prepositional phrases (e.g. <em>naar school</em>).</li>
                  <li>Final verbs like infinitives or past participles (e.g. <em>gedaan</em>, <em>komen</em>).</li>
                </ul>
                <div className="mt-2 bg-white/70 rounded p-2 border border-red-200/50 space-y-1 text-[11px] leading-relaxed">
                  <p>• <em>Ik heb het <strong>niet</strong> gedaan.</em> (I didn't do it.)</p>
                  <p>• <em>We gaan <strong>niet</strong> naar huis.</em> (We're not going home.)</p>
                </div>
              </div>
            </div>

            {/* Trigger Verbs Rules */}
            <div className="bg-orange-50/30 border border-orange-100 rounded-xl p-4 text-xs text-orange-950 space-y-2">
              <h4 className="font-bold text-orange-900 flex items-center gap-1">
                ⚡ Trigger Verbs (Kicking Verbs to the End)
              </h4>
              <p className="leading-relaxed">
                In Dutch, certain words act as "triggers" that kick other verbs to the **very end** of the sentence or clause:
              </p>
              <div className="space-y-3">
                <div>
                  <span className="font-bold text-orange-900 block">1. Modal & Auxiliary Verbs (Main Clauses)</span>
                  <p className="text-gray-755 leading-relaxed">
                    Modal verbs (e.g., <em>willen</em>, <em>moeten</em>, <em>kunnen</em>, <em>mogen</em>, <em>zullen</em>) and auxiliary verbs (<em>hebben</em>, <em>zijn</em>) take the second position in a sentence. They trigger the main action verb to go to the <strong>very end</strong> of the sentence in its infinitive form or past participle:
                  </p>
                  <div className="mt-1 bg-white/70 rounded p-2 border border-orange-200/50 text-[11px] leading-relaxed">
                    <p>• <em>Ik <strong>wil</strong> nederlands <strong>leren</strong>.</em> (I want to learn Dutch.)</p>
                    <p>• <em>Je <strong>moet</strong> nu <strong>slapen</strong>.</em> (You must sleep now.)</p>
                  </div>
                </div>
                <div>
                  <span className="font-bold text-orange-900 block">2. Subordinating Conjunctions (Dependent Clauses)</span>
                  <p className="text-gray-755 leading-relaxed">
                    Conjunctions like <em>omdat</em> (because), <em>als</em> (if/when), <em>dat</em> (that), and <em>wanneer</em> (when) start subclauses. They act as verb kickers, sending **all verbs** to the **very end** of the clause:
                  </p>
                  <div className="mt-1 bg-white/70 rounded p-2 border border-orange-200/50 text-[11px] leading-relaxed">
                    <p>• <em>Ik ben blij omdat ik vakantie <strong>heb</strong>.</em> (I'm happy because I have a vacation.)</p>
                    <p>• <em>Hij zegt dat hij ziek <strong>is</strong>.</em> (He says that he is sick.)</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Word Order Game Sandbox */}
          <div className="border border-gray-200 bg-gray-50/60 rounded-xl p-5">
            <div className="flex justify-between items-center mb-3">
              <h4 className="font-bold text-sm text-gray-800">
                🧩 Sentence Reordering Quiz (Sentence {currentSentenceIdx + 1}/{scrambledSentences.length})
              </h4>
              <button
                type="button"
                onClick={resetSentenceGame}
                className="text-xs font-semibold text-gray-500 hover:text-gray-900"
              >
                Reset
              </button>
            </div>

            <p className="text-xs text-gray-500 mb-2">English Target Meaning:</p>
            <div className="font-semibold text-sm text-gray-900 bg-white border border-gray-150 rounded-lg px-3 py-2.5 mb-4 shadow-sm">
              "{currentSentence.english}"
            </div>

            <p className="text-xs text-gray-500 mb-2">Click the words below in the correct Dutch order:</p>
            
            {/* Scrambled Pool */}
            <div className="flex gap-2 flex-wrap mb-4">
              {shuffledWords.map((word) => {
                const isSelected = selectedWords.includes(word);
                return (
                  <button
                    key={word}
                    type="button"
                    onClick={() => handleWordClick(word)}
                    disabled={isSelected}
                    className={`px-3 py-2 text-xs font-semibold rounded-lg border transition ${
                      isSelected
                        ? "bg-gray-150 border-gray-200 text-gray-400 cursor-not-allowed"
                        : "bg-white border-gray-300 text-gray-800 hover:border-gray-950 hover:bg-gray-50 active:scale-95 shadow-sm"
                    }`}
                  >
                    {word}
                  </button>
                );
              })}
            </div>

            {/* Selected Sentence Builder */}
            <div className="min-h-[50px] border-2 border-dashed border-gray-300 rounded-lg p-2 flex gap-1.5 flex-wrap items-center bg-white shadow-inner mb-4">
              {selectedWords.length === 0 ? (
                <span className="text-xs text-gray-450 italic pl-1">Your constructed sentence will appear here...</span>
              ) : (
                selectedWords.map((word, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleWordClick(word)}
                    className="px-2.5 py-1 bg-gray-900 text-white text-xs font-semibold rounded hover:bg-gray-700 transition"
                  >
                    {word} <span className="ml-1 text-[9px] text-gray-350">×</span>
                  </button>
                ))
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={checkSentence}
                disabled={selectedWords.length !== currentSentence.correct.length}
                className="flex-1 bg-gray-900 text-white rounded-lg py-2.5 text-xs font-semibold hover:bg-gray-800 transition active:scale-95 disabled:opacity-50"
              >
                Validate Sentence
              </button>
              {gameFeedback?.isCorrect && (
                <button
                  type="button"
                  onClick={nextSentence}
                  className="bg-green-600 text-white rounded-lg px-4 py-2.5 text-xs font-semibold hover:bg-green-700 transition active:scale-95"
                >
                  Next ➔
                </button>
              )}
            </div>

            {gameFeedback && (
              <div className={`mt-4 rounded-lg p-3 text-xs leading-relaxed border ${
                gameFeedback.isCorrect ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"
              }`}>
                {gameFeedback.text}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: De vs. Het Noun Quiz */}
      {activeSubTab === "articles" && (
        <div className="space-y-6 text-left">
          <div className="bg-orange-50/40 border border-orange-100 rounded-xl p-4 text-sm text-orange-900">
            <h3 className="font-bold text-orange-950 mb-1">De vs. Het Articles</h3>
            <p className="leading-relaxed">
              Every Dutch noun is either a <strong>De</strong> word (masculine/feminine) or a <strong>Het</strong> word (neuter).
              Around 75% of nouns are <strong>De</strong> words, but there are some useful shortcuts to identify <strong>Het</strong> words:
            </p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-xs">
              <li>All plural nouns take <strong>De</strong> (e.g. <span className="italic">de boeken</span>).</li>
              <li>All diminutive nouns (ending in -je) take <strong>Het</strong> (e.g. <span className="italic">het meisje</span>).</li>
              <li>Infinitives used as nouns take <strong>Het</strong> (e.g. <span className="italic">het zwemmen</span>).</li>
              <li>Languages, compass directions, and metals take <strong>Het</strong>.</li>
            </ul>
          </div>

          {/* Interactive Noun Quiz */}
          <div className="border border-gray-200 bg-gray-50/60 rounded-xl p-5 text-center">
            <div className="flex justify-between items-center mb-4 text-xs text-gray-500 px-1">
              <span>Noun {currentQuizIdx + 1} of {quizNouns.length}</span>
              <span className="font-bold text-gray-800">Score: {quizScore}</span>
            </div>

            <div className="bg-white border border-gray-150 rounded-xl p-6 shadow-sm mb-4">
              <span className="text-[10px] text-gray-400 font-semibold block uppercase tracking-wider mb-2">What is the article for:</span>
              <p className="text-3xl font-extrabold text-gray-900 mb-4">{currentQuizItem.noun}</p>
              
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  disabled={selectedArticle !== null}
                  onClick={() => handleAnswerArticle("de")}
                  className={`w-28 py-3 rounded-lg font-bold text-sm border transition ${
                    selectedArticle === "de"
                      ? currentQuizItem.article === "de"
                        ? "bg-green-600 border-green-600 text-white"
                        : "bg-red-600 border-red-600 text-white"
                      : selectedArticle !== null && currentQuizItem.article === "de"
                      ? "bg-green-100 border-green-200 text-green-800"
                      : "bg-white border-gray-300 text-gray-800 hover:border-gray-950 active:scale-95"
                  }`}
                >
                  DE
                </button>
                <button
                  type="button"
                  disabled={selectedArticle !== null}
                  onClick={() => handleAnswerArticle("het")}
                  className={`w-28 py-3 rounded-lg font-bold text-sm border transition ${
                    selectedArticle === "het"
                      ? currentQuizItem.article === "het"
                        ? "bg-green-600 border-green-600 text-white"
                        : "bg-red-600 border-red-600 text-white"
                      : selectedArticle !== null && currentQuizItem.article === "het"
                      ? "bg-green-100 border-green-200 text-green-800"
                      : "bg-white border-gray-300 text-gray-800 hover:border-gray-950 active:scale-95"
                  }`}
                >
                  HET
                </button>
              </div>
            </div>

            {quizFeedback && (
              <div className="mt-4 rounded-lg bg-white border border-gray-200 p-4 text-xs text-left animate-fade-in">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-gray-800">Explanation:</span>
                  <button
                    type="button"
                    onClick={() => handleAudioSpeak(`${currentQuizItem.article} ${currentQuizItem.noun}`)}
                    className="p-1 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs active:scale-95"
                  >
                    🔊 Listen
                  </button>
                </div>
                <p className="text-gray-700 mt-1 leading-relaxed">{quizFeedback}</p>
                
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={nextQuizItem}
                    className="bg-gray-900 text-white rounded-lg px-4 py-2 text-xs font-semibold hover:bg-gray-800 transition active:scale-95"
                  >
                    Next Noun ➔
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 5: Phonetics & Pronunciation */}
      {activeSubTab === "phonetics" && (() => {
        const filteredCards = phoneticWordCards.filter((card) => {
          if (phoneticsCategory !== "all" && card.category !== phoneticsCategory) {
            return false;
          }
          const s = phoneticSearch.toLowerCase().trim();
          if (!s) return true;
          return (
            card.word1.toLowerCase().includes(s) ||
            card.translation1.toLowerCase().includes(s) ||
            (card.type === "pair" &&
              (card.word2.toLowerCase().includes(s) ||
                card.translation2.toLowerCase().includes(s)))
          );
        });

        return (
          <div className="space-y-6 text-left animate-fade-in">
            {/* Header Banner */}
            <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-5 text-sm text-blue-900 shadow-xs relative overflow-hidden">
              <div className="absolute right-0 top-0 translate-x-3 -translate-y-3 opacity-10 text-8xl pointer-events-none select-none">💬</div>
              <h3 className="font-extrabold text-blue-950 text-base mb-1.5 flex items-center gap-2">
                <span>🗣️</span> Dutch Phonetics Trainer
              </h3>
              <p className="leading-relaxed text-xs text-blue-800">
                Dutch vowels and consonants can be tricky for English speakers. Switch to study cards to explore minimal pairs with interactive audio comparison, or select ear training to test your listening skills!
              </p>
            </div>

            {/* Mode Pill Toggle (Explore vs Quiz) */}
            <div className="flex bg-gray-100/80 rounded-2xl p-1 mb-4 select-none max-w-sm mx-auto border border-gray-200 shadow-inner">
              <button
                type="button"
                className={`flex-1 rounded-xl py-3 text-xs font-bold text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  phoneticsMode === "study"
                    ? "bg-white text-gray-900 shadow-md transform scale-102"
                    : "text-gray-500 hover:text-gray-900 hover:bg-white/50"
                }`}
                onClick={() => setPhoneticsMode("study")}
              >
                <span>📖</span> Explore Sounds
              </button>
              <button
                type="button"
                className={`flex-1 rounded-xl py-3 text-xs font-bold text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  phoneticsMode === "quiz"
                    ? "bg-white text-gray-900 shadow-md transform scale-102"
                    : "text-gray-500 hover:text-gray-900 hover:bg-white/50"
                }`}
                onClick={() => {
                  setPhoneticsMode("quiz");
                  startNewEarTraining();
                }}
              >
                <span>👂</span> Test Your Ear
              </button>
            </div>

            {/* Explore Sounds Panel */}
            {phoneticsMode === "study" && (
              <div className="space-y-5 animate-fade-in">
                {/* Category selector + Search row */}
                <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                  {/* Search Bar */}
                  <div className="relative flex-1">
                    <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none select-none text-xs">🔍</span>
                    <input
                      type="text"
                      value={phoneticSearch}
                      onChange={(e) => setPhoneticSearch(e.target.value)}
                      placeholder="Search phonetic words (e.g. huid, maan, peer, kinderen)..."
                      className="w-full rounded-xl border border-gray-300 pl-9 pr-10 py-2.5 text-xs focus:border-gray-900 focus:ring-1 focus:ring-gray-950 focus:outline-none bg-white shadow-sm transition-all animate-fade-in"
                    />
                    {phoneticSearch && (
                      <button
                        type="button"
                        onClick={() => setPhoneticSearch("")}
                        className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 text-xs cursor-pointer bg-transparent border-none"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Categories */}
                  <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200 self-start md:self-auto">
                    {(["all", "vowels", "diphthongs", "consonants"] as const).map((cat) => {
                      const count = cat === "all" 
                        ? phoneticWordCards.length 
                        : phoneticWordCards.filter((c) => c.category === cat).length;
                      const labels = {
                        all: "All",
                        vowels: "Vowels",
                        diphthongs: "Diphthongs",
                        consonants: "Consonants"
                      };
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setPhoneticsCategory(cat)}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                            phoneticsCategory === cat
                              ? "bg-white text-gray-955 shadow-xs"
                              : "text-gray-500 hover:text-gray-900"
                          }`}
                        >
                          {labels[cat]} <span className="text-[10px] opacity-60 font-normal">({count})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Sound Card List */}
                <div className="grid gap-5 sm:grid-cols-2 max-h-[560px] overflow-y-auto pr-1">
                  {filteredCards.length > 0 ? (
                    filteredCards.map((card, idx) => {
                      const cardId = `${card.word1}-${card.word2 || "single"}`;
                      const isVowel = card.category === "vowels";
                      const isDiphthong = card.category === "diphthongs";

                      const badgeColor = isVowel
                        ? "text-blue-705 bg-blue-50/70 border-blue-100"
                        : isDiphthong
                        ? "text-purple-705 bg-purple-50/70 border-purple-100"
                        : "text-emerald-705 bg-emerald-50/70 border-emerald-100";

                      const leftBorder = isVowel
                        ? "border-l-4 border-l-blue-400"
                        : isDiphthong
                        ? "border-l-4 border-l-purple-400"
                        : "border-l-4 border-l-emerald-400";

                      if (card.type === "pair") {
                        const isW1Active = activeSpokenWord === card.word1;
                        const isW2Active = activeSpokenWord === card.word2;

                        return (
                          <div 
                            key={idx} 
                            className={`border border-gray-200 bg-white rounded-2xl p-4 shadow-xs hover:shadow-md hover:border-gray-450 transition-all duration-200 flex flex-col justify-between ${leftBorder}`}
                          >
                            <div>
                              {/* Card Header Info */}
                              <div className="flex justify-between items-center mb-3">
                                <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded border uppercase tracking-wider ${badgeColor}`}>
                                  {card.category} pair
                                </span>
                                <button
                                  type="button"
                                  disabled={isPlayingBoth !== null}
                                  onClick={() => handlePlayBoth(card.word1, card.word2, cardId)}
                                  className={`text-[10px] font-bold px-3 py-1 rounded-lg transition-all border shadow-xs cursor-pointer ${
                                    isPlayingBoth === cardId
                                      ? "bg-orange-100 border-orange-200 text-orange-700 animate-pulse font-black"
                                      : "bg-gray-900 border-gray-950 text-white hover:bg-gray-800"
                                  }`}
                                >
                                  {isPlayingBoth === cardId ? "🔄 Comparing..." : "🔄 Compare Both"}
                                </button>
                              </div>

                              {/* Two Word Blocks side-by-side */}
                              <div className="grid grid-cols-2 gap-3">
                                {/* Word 1 */}
                                <div
                                  onClick={() => handleAudioSpeak(card.word1)}
                                  className={`p-3 border rounded-xl text-center cursor-pointer transition-all hover:scale-[1.02] ${
                                    isW1Active
                                      ? "bg-orange-50 border-orange-300 ring-2 ring-orange-150 shadow-xs"
                                      : "bg-gray-50 border-gray-200 hover:bg-gray-100/60"
                                  }`}
                                >
                                  <span className="block mb-1 text-center relative font-semibold text-gray-900">
                                    {renderHighlightedWord(card.word1, card.highlight1)}
                                    {isW1Active && (
                                      <span className="absolute -top-1.5 -right-1 text-xs animate-bounce">🔊</span>
                                    )}
                                  </span>
                                  <span className="text-[11px] text-gray-550 block mb-2 font-medium">
                                    ({card.translation1})
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAudioSpeak(card.word1);
                                    }}
                                    className={`text-[10px] font-bold px-2 py-1 rounded-md w-full flex items-center justify-center gap-1 transition-all border-none cursor-pointer ${
                                      lastSpeechText === card.word1 && useSlowSpeech
                                        ? "bg-orange-100 text-orange-700 font-extrabold"
                                        : "bg-blue-50 text-blue-700 hover:bg-blue-105"
                                    }`}
                                  >
                                    {lastSpeechText === card.word1 && useSlowSpeech ? "🐢 Slow" : "🔊 Listen"}
                                  </button>
                                </div>

                                {/* Word 2 */}
                                <div
                                  onClick={() => handleAudioSpeak(card.word2)}
                                  className={`p-3 border rounded-xl text-center cursor-pointer transition-all hover:scale-[1.02] ${
                                    isW2Active
                                      ? "bg-orange-50 border-orange-300 ring-2 ring-orange-155 shadow-xs"
                                      : "bg-gray-50 border-gray-200 hover:bg-gray-100/60"
                                  }`}
                                >
                                  <span className="block mb-1 text-center relative font-semibold text-gray-900">
                                    {renderHighlightedWord(card.word2, card.highlight2)}
                                    {isW2Active && (
                                      <span className="absolute -top-1.5 -right-1 text-xs animate-bounce">🔊</span>
                                    )}
                                  </span>
                                  <span className="text-[11px] text-gray-550 block mb-2 font-medium">
                                    ({card.translation2})
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAudioSpeak(card.word2);
                                    }}
                                    className={`text-[10px] font-bold px-2 py-1 rounded-md w-full flex items-center justify-center gap-1 transition-all border-none cursor-pointer ${
                                      lastSpeechText === card.word2 && useSlowSpeech
                                        ? "bg-orange-100 text-orange-700 font-extrabold"
                                        : "bg-blue-50 text-blue-700 hover:bg-blue-105"
                                    }`}
                                  >
                                    {lastSpeechText === card.word2 && useSlowSpeech ? "🐢 Slow" : "🔊 Listen"}
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Explanation Tip */}
                            <div className="text-[11px] text-gray-655 mt-4 leading-relaxed border-t border-gray-150 pt-2.5 flex items-start gap-1.5">
                              <span className="text-orange-500 text-xs">💡</span>
                              <span>{card.explanation}</span>
                            </div>
                          </div>
                        );
                      } else {
                        const isW1Active = activeSpokenWord === card.word1;

                        return (
                          <div 
                            key={idx} 
                            className={`border border-gray-200 bg-white rounded-2xl p-4 shadow-xs hover:shadow-md hover:border-gray-450 transition-all duration-200 sm:col-span-2 flex flex-col justify-between ${leftBorder}`}
                          >
                            <div>
                              <div className="flex justify-between items-start mb-2">
                                <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded border uppercase tracking-wider ${badgeColor}`}>
                                  {card.category} Single
                                </span>
                              </div>
                              <div 
                                onClick={() => handleAudioSpeak(card.word1)}
                                className={`flex gap-4 items-center p-3 border rounded-xl cursor-pointer transition-all hover:bg-gray-100/50 ${
                                  isW1Active ? "bg-orange-50 border-orange-300 ring-2 ring-orange-150 shadow-xs" : "bg-gray-50 border-gray-200"
                                }`}
                              >
                                <div className="flex-1 relative">
                                  <span className="block mb-0.5">{renderHighlightedWord(card.word1, card.highlight1)}</span>
                                  <span className="text-xs text-gray-550 font-medium">({card.translation1})</span>
                                  {isW1Active && (
                                    <span className="absolute top-1 right-2 text-xs animate-bounce">🔊</span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAudioSpeak(card.word1);
                                  }}
                                  className={`px-4 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1 transition-all border-none cursor-pointer ${
                                    lastSpeechText === card.word1 && useSlowSpeech
                                      ? "bg-orange-100 text-orange-700 font-extrabold"
                                      : "bg-blue-50 text-blue-700 hover:bg-blue-105"
                                  }`}
                                >
                                  {lastSpeechText === card.word1 && useSlowSpeech ? "🐢 Slow" : "🔊 Listen"}
                                </button>
                              </div>
                            </div>
                            <div className="text-[11px] text-gray-655 mt-4 leading-relaxed border-t border-gray-150 pt-2.5 flex items-start gap-1.5">
                              <span className="text-orange-500 text-xs">💡</span>
                              <span>{card.explanation}</span>
                            </div>
                          </div>
                        );
                      }
                    })
                  ) : (
                    <div className="sm:col-span-2 text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
                      <span className="text-2xl block mb-2">🔍</span>
                      <p className="text-sm font-semibold text-gray-600">No sounds found matching "{phoneticSearch}"</p>
                      <p className="text-xs text-gray-400 mt-1">Try another search or select a different category filter.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Ear Training Game Panel */}
            {phoneticsMode === "quiz" && (
              <div className="space-y-4 animate-fade-in">
                {/* Quiz Category Filter Row */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-orange-100 shadow-xs">
                  <div className="text-left">
                    <span className="text-xs font-bold text-gray-800 flex items-center gap-1">
                      <span>🎯</span> Select Sound Type to Practice:
                    </span>
                    <span className="text-[10px] text-gray-500">Train your ear on specific sound groups</span>
                  </div>
                  <div className="flex flex-wrap gap-1 bg-gray-100 p-0.5 rounded-xl border border-gray-200">
                    {(["all", "vowels", "diphthongs", "consonants"] as const).map((cat) => {
                      const count = cat === "all" 
                        ? earTrainingPairs.length 
                        : earTrainingPairs.filter((p) => p.category === cat).length;
                      const labels = {
                        all: "All",
                        vowels: "Vowels",
                        diphthongs: "Diphthongs",
                        consonants: "Consonants"
                      };
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            setQuizCategory(cat);
                            startNewEarTraining(cat);
                          }}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                            quizCategory === cat
                              ? "bg-white text-gray-950 shadow-xs"
                              : "text-gray-500 hover:text-gray-900"
                          }`}
                        >
                          {labels[cat]} <span className="text-[9px] opacity-60 font-normal">({count})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Training Playback & Choice Area */}
                <div className="border border-orange-200 bg-orange-50/20 rounded-2xl p-5 text-center shadow-xs">
                  {/* Score & Recent history tracker */}
                  <div className="flex flex-col sm:flex-row justify-between items-center gap-2 mb-5 text-xs text-gray-655 border-b border-orange-100 pb-4">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-700">Recent:</span>
                      <div className="flex gap-1.5 items-center">
                        {quizHistory.length === 0 ? (
                          <span className="text-[10px] text-gray-400 italic font-medium">No attempts yet</span>
                        ) : (
                          quizHistory.map((res, index) => (
                            <span
                              key={index}
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-xs ${
                                res ? "bg-green-500 animate-scale-in" : "bg-red-500 animate-scale-in"
                              }`}
                            >
                              {res ? "✓" : "✗"}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                    <span className="font-bold text-gray-805 bg-white border border-orange-200/80 px-3.5 py-1.5 rounded-full shadow-xs">
                      Accuracy: {earTotal > 0 ? Math.round((earScore / earTotal) * 100) : 0}% ({earScore}/{earTotal})
                    </span>
                  </div>

                  {/* Listening Deck */}
                  <div className="bg-white border border-orange-200/80 rounded-2xl p-6 shadow-xs mb-4 flex flex-col items-center">
                    <span className="text-[10px] text-gray-400 font-bold block uppercase tracking-wider mb-5">
                      Listen to the word and select what you hear:
                    </span>
                    
                    {earTrainingQuestion ? (
                      <div className="w-full flex flex-col items-center">
                        {/* Audio Controls */}
                        <div className="flex justify-center gap-4 mb-7">
                          <button
                            type="button"
                            onClick={() => playMysterySound(false)}
                            className="w-16 h-16 rounded-full bg-orange-100 hover:bg-orange-200 text-orange-850 font-bold shadow-md hover:shadow-lg transition-all transform active:scale-95 flex flex-col items-center justify-center border-none cursor-pointer group"
                            title="Listen normal speed"
                          >
                            <span className="text-xl group-hover:scale-110 transition-transform">🔊</span>
                            <span className="text-[9px] mt-1 font-bold">Normal</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => playMysterySound(true)}
                            className="w-16 h-16 rounded-full bg-orange-50 hover:bg-orange-100 text-orange-750 font-bold shadow-md hover:shadow-lg transition-all transform active:scale-95 flex flex-col items-center justify-center border border-orange-205 cursor-pointer group"
                            title="Listen slow speed"
                          >
                            <span className="text-xl group-hover:scale-110 transition-transform">🐢</span>
                            <span className="text-[9px] mt-1 font-bold">Slow</span>
                          </button>
                        </div>

                        {/* Options to Choose */}
                        <div className="w-full grid grid-cols-2 gap-4">
                          <button
                            type="button"
                            disabled={selectedWordAnswer !== null}
                            onClick={() => handleAnswerEar(earTrainingQuestion.word1)}
                            className={`py-4 px-3 rounded-xl font-extrabold text-base border-2 transition-all cursor-pointer flex flex-col items-center justify-center gap-1 select-none ${
                              selectedWordAnswer === earTrainingQuestion.word1
                                ? earTrainingQuestion.correct === earTrainingQuestion.word1
                                  ? "bg-green-600 border-green-600 text-white shadow-md scale-102 font-black"
                                  : "bg-red-600 border-red-600 text-white shadow-md scale-102 font-black"
                                : selectedWordAnswer !== null && earTrainingQuestion.correct === earTrainingQuestion.word1
                                ? "bg-green-50 border-green-400 text-green-800 font-black shadow-sm"
                                : "bg-gray-50 border-gray-200 text-gray-800 hover:border-gray-950 active:scale-95 shadow-sm"
                            }`}
                          >
                            <span className="text-base font-black">{earTrainingQuestion.word1}</span>
                            <span className={`text-[10px] font-bold ${selectedWordAnswer === earTrainingQuestion.word1 ? 'text-white' : 'text-gray-400'}`}>
                              ({earTrainingQuestion.translation1})
                            </span>
                          </button>

                          <button
                            type="button"
                            disabled={selectedWordAnswer !== null}
                            onClick={() => handleAnswerEar(earTrainingQuestion.word2)}
                            className={`py-4 px-3 rounded-xl font-extrabold text-base border-2 transition-all cursor-pointer flex flex-col items-center justify-center gap-1 select-none ${
                              selectedWordAnswer === earTrainingQuestion.word2
                                ? earTrainingQuestion.correct === earTrainingQuestion.word2
                                  ? "bg-green-600 border-green-600 text-white shadow-md scale-102 font-black"
                                  : "bg-red-600 border-red-600 text-white shadow-md scale-102 font-black"
                                : selectedWordAnswer !== null && earTrainingQuestion.correct === earTrainingQuestion.word2
                                ? "bg-green-50 border-green-400 text-green-800 font-black shadow-sm"
                                : "bg-gray-50 border-gray-200 text-gray-800 hover:border-gray-950 active:scale-95 shadow-sm"
                            }`}
                          >
                            <span className="text-base font-black">{earTrainingQuestion.word2}</span>
                            <span className={`text-[10px] font-bold ${selectedWordAnswer === earTrainingQuestion.word2 ? 'text-white' : 'text-gray-400'}`}>
                              ({earTrainingQuestion.translation2})
                            </span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="py-6 flex flex-col items-center gap-2">
                        <span className="text-4xl">👂</span>
                        <p className="text-sm font-semibold text-gray-700">Ready to test your Dutch pronunciation recognition?</p>
                        <button
                          type="button"
                          onClick={() => startNewEarTraining()}
                          className="mt-4 px-8 py-3 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-gray-800 active:scale-95 shadow-md cursor-pointer border-none flex items-center gap-2"
                        >
                          <span>Start Ear Training Game</span>
                          <span>➔</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Explanation feedback */}
                  {earFeedback && earTrainingQuestion && (
                    <div className="mt-4 rounded-2xl bg-white border border-orange-200 p-5 text-xs text-left animate-fade-in shadow-xs">
                      <div className="flex items-center gap-1.5 font-bold text-gray-800 mb-2">
                        <span className="text-base">💡</span>
                        <span>Pronunciation Difference Guide:</span>
                      </div>
                      <p className="text-gray-750 leading-relaxed bg-gray-50 border border-gray-150 p-3 rounded-xl font-medium">
                        {earTrainingQuestion.hint}
                      </p>
                      
                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={() => startNewEarTraining()}
                          className="bg-gray-900 text-white rounded-xl px-5 py-2.5 text-xs font-bold hover:bg-gray-800 transition active:scale-95 shadow-sm cursor-pointer border-none flex items-center gap-1"
                        >
                          <span>Next Sound</span>
                          <span>➔</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Tab 6: Adjective Endings (-e) */}
      {activeSubTab === "adjectives" && (
        <div className="space-y-6 text-left animate-fade-in">
          {/* Header Banner */}
          <div className="bg-purple-50/50 border border-purple-100 rounded-2xl p-5 text-sm text-purple-900 shadow-xs relative overflow-hidden">
            <div className="absolute right-0 top-0 translate-x-3 -translate-y-3 opacity-10 text-8xl pointer-events-none select-none">✏️</div>
            <h3 className="font-extrabold text-purple-950 text-base mb-1.5 flex items-center gap-2">
              <span>✏️</span> Adjective Endings (De buigings-e)
            </h3>
            <p className="leading-relaxed text-xs text-purple-800">
              When does a Dutch adjective get an <strong>-e</strong> ending? Learn the golden rule: adjectives always get an <strong>-e</strong> except when describing a <strong>singular neuter (het) noun</strong> with an <strong>indefinite</strong> article (een / geen / no article).
            </p>
          </div>

          {/* Mode Pill Toggle */}
          <div className="flex bg-gray-100/80 rounded-2xl p-1 mb-4 select-none max-w-sm mx-auto border border-gray-200 shadow-inner">
            <button
              type="button"
              className={`flex-1 rounded-xl py-3 text-xs font-bold text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                adjectiveMode === "builder"
                  ? "bg-white text-gray-900 shadow-md transform scale-102"
                  : "text-gray-500 hover:text-gray-900 hover:bg-white/50"
              }`}
              onClick={() => setAdjectiveMode("builder")}
            >
              <span>🛠️</span> Phrase Builder
            </button>
            <button
              type="button"
              className={`flex-1 rounded-xl py-3 text-xs font-bold text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                adjectiveMode === "quiz"
                  ? "bg-white text-gray-900 shadow-md transform scale-102"
                  : "text-gray-500 hover:text-gray-900 hover:bg-white/50"
              }`}
              onClick={() => {
                setAdjectiveMode("quiz");
                startNewAdjectiveQuiz();
              }}
            >
              <span>📝</span> Quiz Practice
            </button>
          </div>

          {/* Phrase Builder Panel */}
          {adjectiveMode === "builder" && (() => {
            const currentNoun = adjectiveNouns[selectedBuilderNounIdx];
            const currentAdj = adjectiveWords[selectedBuilderAdjectiveIdx];
            
            // Determine article word
            let articleWord = "";
            if (selectedBuilderArticle === "definite") {
              articleWord = currentNoun.gender === "de" || currentNoun.plural ? "de" : "het";
            } else if (selectedBuilderArticle === "indefinite") {
              articleWord = "een";
            } else {
              articleWord = "";
            }

            const res = getAdjectiveEnding(selectedBuilderArticle, currentNoun, currentAdj);
            const phraseText = `${articleWord} ${res.adjective} ${currentNoun.word}`.trim();

            return (
              <div className="space-y-5 animate-fade-in">
                <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Selectors Column */}
                  <div className="space-y-4 md:col-span-1 border-b md:border-b-0 md:border-r border-gray-150 pb-4 md:pb-0 md:pr-6">
                    {/* 1. Article Type */}
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">1. Choose Article:</label>
                      <div className="grid grid-cols-3 gap-1 bg-gray-100 p-0.5 rounded-lg border border-gray-250">
                        {(["definite", "indefinite", "none"] as const).map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setSelectedBuilderArticle(type)}
                            className={`py-1 px-1.5 text-[10px] font-bold rounded transition cursor-pointer ${
                              selectedBuilderArticle === type
                                ? "bg-white text-gray-900 shadow-xs"
                                : "text-gray-500 hover:text-gray-900"
                            }`}
                          >
                            {type === "definite" ? "Definite" : type === "indefinite" ? "Een" : "None"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 2. Adjective */}
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">2. Choose Adjective:</label>
                      <select
                        value={selectedBuilderAdjectiveIdx}
                        onChange={(e) => setSelectedBuilderAdjectiveIdx(Number(e.target.value))}
                        className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 shadow-sm cursor-pointer"
                      >
                        {adjectiveWords.map((adj, idx) => (
                          <option key={idx} value={idx}>
                            {adj.stem} ({adj.translation})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 3. Noun */}
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">3. Choose Noun:</label>
                      <select
                        value={selectedBuilderNounIdx}
                        onChange={(e) => setSelectedBuilderNounIdx(Number(e.target.value))}
                        className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 shadow-sm cursor-pointer"
                      >
                        {adjectiveNouns.map((noun, idx) => (
                          <option key={idx} value={idx}>
                            {noun.word} [{noun.gender === "de" ? "DE" : "HET"}{noun.plural ? ", plural" : ""}] ({noun.translation})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Result Column */}
                  <div className="md:col-span-2 flex flex-col justify-between">
                    <div className="text-center md:text-left">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-3">Resulting Phrase:</span>
                      
                      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 inline-block w-full text-center shadow-inner">
                        <p className="text-3xl font-black tracking-tight text-gray-900 mb-1 flex items-center justify-center gap-2 select-none">
                          {articleWord && <span className="text-gray-400 lowercase">{articleWord}</span>}
                          <span className="text-purple-605 font-black">
                            {res.adjective.slice(0, res.adjective.length - (res.ending ? 1 : 0))}
                            {res.ending && <span className="text-orange-500 underline decoration-2">{res.ending}</span>}
                          </span>
                          <span className="text-gray-900 font-extrabold">{currentNoun.word}</span>
                        </p>
                        <div className="mt-3 flex justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleAudioSpeak(phraseText, false)}
                            className={`px-3 py-1 text-[10px] font-bold rounded-lg flex items-center gap-1 transition active:scale-95 cursor-pointer border ${
                              lastSpeechText === phraseText && !useSlowSpeech
                                ? "bg-orange-50 border-orange-200 text-orange-700 font-extrabold"
                                : "bg-white border-gray-200 text-gray-700 hover:bg-gray-150"
                            }`}
                          >
                            🔊 Listen
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAudioSpeak(phraseText, true)}
                            className={`px-3 py-1 text-[10px] font-bold rounded-lg flex items-center gap-1 transition active:scale-95 cursor-pointer border ${
                              lastSpeechText === phraseText && useSlowSpeech
                                ? "bg-orange-100 border-orange-200 text-orange-700 font-extrabold"
                                : "bg-white border-gray-200 text-gray-700 hover:bg-gray-150"
                            }`}
                          >
                            🐢 Slow
                          </button>
                        </div>
                        <span className="text-xs text-gray-550 font-semibold block mt-3">
                          Meaning: "{articleWord ? articleWord : ""} {currentAdj.translation} {currentNoun.translation}"
                        </span>
                      </div>
                    </div>

                    {/* Rule Explanation */}
                    <div className="mt-4 bg-purple-50/30 border border-purple-100 rounded-xl p-4 text-xs text-purple-955 flex gap-2.5 items-start">
                      <span className="text-sm">💡</span>
                      <div className="space-y-1">
                        <p className="font-bold">Why?</p>
                        <p className="leading-relaxed text-purple-900">{res.rule}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Quiz Practice Panel */}
          {adjectiveMode === "quiz" && (() => {
            const question = adjectiveQuizQuestions[adjectiveQuizIdx];
            if (!question) return null;
            const correctQuizText = `${question.article} ${question.isEEnding ? question.adjectiveCombined : question.adjectiveStem} ${question.noun}`.trim();

            return (
              <div className="border border-purple-200 bg-purple-55/20 rounded-2xl p-5 text-center shadow-xs animate-fade-in">
                {/* Score tracker */}
                <div className="flex justify-between items-center mb-5 text-xs text-gray-600 px-1 border-b border-purple-100 pb-3">
                  <span className="font-semibold">Test your Adjective Ending rules</span>
                  <span className="font-bold text-gray-800 bg-white border border-purple-150 px-3 py-1.5 rounded-full shadow-xs">
                    Score: {adjectiveQuizScore}/{adjectiveQuizTotal}
                  </span>
                </div>

                {/* Question Area */}
                <div className="bg-white border border-purple-100 rounded-2xl p-6 shadow-sm mb-4">
                  <span className="text-[10px] text-gray-400 font-bold block uppercase tracking-wider mb-3">Complete the sentence:</span>
                  
                  <p className="text-2xl font-black text-gray-900 mb-2 flex items-center justify-center gap-2">
                    {question.article && <span>{question.article}</span>}
                    <span className="text-purple-655 border-b-2 border-dashed border-purple-300 px-2 min-w-16">
                      {selectedAdjectiveAnswer === null 
                        ? `[ ${question.adjectiveStem} / ${question.adjectiveCombined} ]` 
                        : question.isEEnding ? question.adjectiveCombined : question.adjectiveStem
                      }
                    </span>
                    <span>{question.noun}</span>
                  </p>
                  
                  <span className="text-xs text-gray-500 font-semibold block mb-3">
                    English translation: "{question.translation}"
                  </span>

                  <div className="flex justify-center gap-2 mb-6">
                    <button
                      type="button"
                      onClick={() => handleAudioSpeak(correctQuizText, false)}
                      className={`px-3 py-1 text-[10px] font-bold rounded-lg flex items-center gap-1 transition active:scale-95 cursor-pointer border ${
                        lastSpeechText === correctQuizText && !useSlowSpeech
                          ? "bg-orange-50 border-orange-200 text-orange-700 font-extrabold"
                          : "bg-white border-gray-200 text-gray-700 hover:bg-gray-150"
                      }`}
                    >
                      🔊 Listen
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAudioSpeak(correctQuizText, true)}
                      className={`px-3 py-1 text-[10px] font-bold rounded-lg flex items-center gap-1 transition active:scale-95 cursor-pointer border ${
                        lastSpeechText === correctQuizText && useSlowSpeech
                          ? "bg-orange-100 border-orange-200 text-orange-700 font-extrabold"
                          : "bg-white border-gray-200 text-gray-700 hover:bg-gray-150"
                      }`}
                    >
                      🐢 Slow
                    </button>
                  </div>

                  <div className="flex justify-center gap-3">
                    <button
                      type="button"
                      disabled={selectedAdjectiveAnswer !== null}
                      onClick={() => handleAnswerAdjective(false)}
                      className={`flex-1 py-3 px-3 rounded-xl font-bold text-sm border-2 transition-all cursor-pointer ${
                        selectedAdjectiveAnswer === false
                          ? !question.isEEnding
                            ? "bg-green-600 border-green-600 text-white shadow-md scale-102"
                            : "bg-red-600 border-red-600 text-white shadow-md scale-102"
                          : selectedAdjectiveAnswer !== null && !question.isEEnding
                          ? "bg-green-50 border-green-400 text-green-800 font-black shadow-xs"
                          : "bg-white border-gray-250 text-gray-800 hover:border-gray-955 active:scale-95 shadow-sm"
                      }`}
                    >
                      <span>No Ending (-e)</span>
                      <span className="block text-[10px] font-normal text-gray-400 mt-1">{question.adjectiveStem}</span>
                    </button>
                    <button
                      type="button"
                      disabled={selectedAdjectiveAnswer !== null}
                      onClick={() => handleAnswerAdjective(true)}
                      className={`flex-1 py-3 px-3 rounded-xl font-bold text-sm border-2 transition-all cursor-pointer ${
                        selectedAdjectiveAnswer === true
                          ? question.isEEnding
                            ? "bg-green-600 border-green-600 text-white shadow-md scale-102"
                            : "bg-red-600 border-red-600 text-white shadow-md scale-102"
                          : selectedAdjectiveAnswer !== null && question.isEEnding
                          ? "bg-green-50 border-green-400 text-green-800 font-black shadow-xs"
                          : "bg-white border-gray-255 text-gray-800 hover:border-gray-955 active:scale-95 shadow-sm"
                      }`}
                    >
                      <span>With Ending (+e)</span>
                      <span className="block text-[10px] font-normal text-gray-400 mt-1">{question.adjectiveCombined}</span>
                    </button>
                  </div>
                </div>

                {adjectiveFeedback && (
                  <div className="mt-4 rounded-xl bg-white border border-purple-100 p-4 text-xs text-left animate-fade-in shadow-xs">
                    <p className="font-bold text-gray-805 mb-1">Explanation:</p>
                    <p className="text-gray-750 leading-relaxed bg-gray-50 border border-gray-150 p-3 rounded-xl">
                      {adjectiveFeedback}
                    </p>
                    
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={nextAdjectiveQuiz}
                        className="bg-gray-900 text-white rounded-xl px-5 py-2.5 text-xs font-bold hover:bg-gray-800 transition active:scale-95 shadow cursor-pointer border-none"
                      >
                        Next Question ➔
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </section>
  );
}
