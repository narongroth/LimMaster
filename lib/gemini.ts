import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface LimitExercise {
  problem: string;
  difficulty: "Easy" | "Medium" | "Hard";
  topic: string;
}

export interface LimitSolution {
  problem: string;
  steps: {
    title: string;
    explanation: string;
    formula: string;
  }[];
  finalAnswer: string;
}

/**
 * Sanitizes LaTeX strings from AI to fix common JSON escaping issues
 * where \t becomes tab, \f becomes form feed, etc.
 */
export function sanitizeLatex(latex: string): string {
  if (!latex) return "";
  return latex
    .replace(/\t/g, "\\t")
    .replace(/\f/g, "\\f")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    // Fix common broken LaTeX from AI
    .replace(/\\t(?=[a-zA-Z])/g, "\\t") // Keep as is if it looks like \tan, \to
    .replace(/\t(?=o)/g, "\\t") // Fix \to specifically
    .replace(/\f(?=rac)/g, "\\f"); // Fix \frac specifically
}

export async function generateExercises(
  count: number = 3, 
  difficulty?: string, 
  topic?: string
): Promise<LimitExercise[]> {
  const difficultyPrompt = difficulty ? `ដែលមានកម្រិតពិបាក: ${difficulty}` : "រួមបញ្ចូលកម្រិតពិបាកចម្រុះ (ងាយស្រួល, មធ្យម, ពិបាក)";
  const topicPrompt = topic ? `លើប្រធានបទ: ${topic}` : "ប្រធានបទអាចរួមមាន៖ លីមីតគ្រឹះ, អនន្ត, ច្បាប់ L'Hopital, លីមីតត្រីកោណមាត្រ ជាដើម";

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `បង្កើតលំហាត់គណនាលីមីត (lim) ចំនួន ${count} ${difficultyPrompt} ${topicPrompt}។
    បញ្ជូនលទ្ធផលជាទម្រង់ JSON array។
    **សំខាន់៖ រាល់រូបមន្ត LaTeX ក្នុង JSON ត្រូវតែប្រើ backslash ពីរ (\\\\) ដើម្បីបញ្ចៀសបញ្ហា escape characters (ឧទាហរណ៍៖ ប្រើ \\\\lim ជំនួសឱ្យ \\lim)។**`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            problem: { type: Type.STRING, description: "The limit problem in LaTeX format (e.g., \\lim_{x \\to 0} \\frac{\\sin x}{x})" },
            difficulty: { type: Type.STRING, enum: ["Easy", "Medium", "Hard"] },
            topic: { type: Type.STRING, description: "Topic name in Khmer" }
          },
          required: ["problem", "difficulty", "topic"]
        }
      }
    }
  });

  const data = JSON.parse(response.text);
  return data.map((item: any) => ({
    ...item,
    problem: sanitizeLatex(item.problem)
  }));
}

export async function scanLimitFromImage(base64Image: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: "Extract the limit problem from this image and return it in LaTeX format. Only return the LaTeX string, nothing else."
          },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image.split(",")[1]
            }
          }
        ]
      }
    ]
  });

  return response.text.trim();
}

export async function solveLimit(problem: string): Promise<LimitSolution> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `ដោះស្រាយលំហាត់លីមីតខាងក្រោមជាជំហានៗ៖ ${problem}។
    ផ្តល់ចំណងជើងច្បាស់លាស់សម្រាប់ជំហាននីមួយៗ ការពន្យល់លម្អិត និងរូបមន្តគណិតវិទ្យាសម្រាប់ជំហាននោះជា LaTeX។
    **សំខាន់៖ រាល់ការពន្យល់ និងចំណងជើងត្រូវតែជាភាសាខ្មែរ។**
    **សំខាន់៖ រាល់រូបមន្ត LaTeX ក្នុង JSON ត្រូវតែប្រើ backslash ពីរ (\\\\) ដើម្បីបញ្ចៀសបញ្ហា escape characters (ឧទាហរណ៍៖ ប្រើ \\\\frac ជំនួសឱ្យ \\frac)។**
    ចុងក្រោយ ផ្តល់ចម្លើយចុងក្រោយ។
    បញ្ជូនលទ្ធផលជាទម្រង់ JSON object។`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          problem: { type: Type.STRING },
          steps: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                explanation: { type: Type.STRING },
                formula: { type: Type.STRING, description: "LaTeX formula for this step" }
              },
              required: ["title", "explanation", "formula"]
            }
          },
          finalAnswer: { type: Type.STRING }
        },
        required: ["problem", "steps", "finalAnswer"]
      }
    }
  });

  const data = JSON.parse(response.text);
  return {
    ...data,
    problem: sanitizeLatex(data.problem),
    steps: data.steps.map((step: any) => ({
      ...step,
      formula: sanitizeLatex(step.formula)
    })),
    finalAnswer: sanitizeLatex(data.finalAnswer)
  };
}
