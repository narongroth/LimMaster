/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Calculator, 
  BookOpen, 
  Send, 
  RefreshCw, 
  ChevronRight, 
  Brain, 
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ListChecks,
  Target,
  ArrowRight,
  History,
  Trash2,
  Clock,
  Filter,
  Layers,
  Sigma,
  Type as TypeIcon,
  MessageSquare,
  ThumbsUp,
  Bug,
  Lightbulb,
  Copy,
  Check,
  Moon,
  Sun,
  Camera,
  Scan
} from "lucide-react";
import Webcam from "react-webcam";
import { supabase } from "./lib/supabase";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { ScrollArea } from "../components/ui/scroll-area";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { generateExercises, solveLimit, scanLimitFromImage, LimitExercise, LimitSolution } from "@/lib/gemini";
import "katex/dist/katex.min.css";
import { InlineMath, BlockMath } from "react-katex";

interface HistoryItem {
  id: string;
  problem: string;
  solution: LimitSolution;
  timestamp: number;
}

export default function App() {
  const [activeTab, setActiveTab] = useState("solver");
  const [inputProblem, setInputProblem] = useState("");
  const [solution, setSolution] = useState<LimitSolution | null>(null);
  const [exercises, setExercises] = useState<LimitExercise[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filter states
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("all");
  const [selectedTopic, setSelectedTopic] = useState<string>("all");
  
  // Input mode state
  const [inputMode, setInputMode] = useState<"simple" | "latex" | "scan">("simple");
  const [isScanning, setIsScanning] = useState(false);
  const webcamRef = React.useRef<Webcam>(null);

  // Feedback state
  const [feedbackType, setFeedbackType] = useState<"suggestion" | "bug" | "other">("suggestion");
  const [feedbackText, setFeedbackText] = useState("");
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  // Copy state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Theme state
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("theme") as "light" | "dark") || "light";
    }
    return "light";
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const loadHistory = React.useCallback(async () => {
    // Load from local storage first for immediate UI
    const saved = localStorage.getItem("limmaster_history");
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }

    // Then try to load from Supabase if available
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('history')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(20);
        
        if (error) throw error;
        if (data && data.length > 0) {
          const remoteHistory: HistoryItem[] = data.map(item => ({
            id: item.id,
            problem: item.problem,
            solution: item.solution,
            timestamp: new Date(item.timestamp).getTime()
          }));
          
          setHistory(prev => {
            // Merge local and remote, avoiding duplicates by problem text
            const combined = [...prev];
            remoteHistory.forEach(remote => {
              if (!combined.some(local => local.problem === remote.problem)) {
                combined.push(remote);
              }
            });
            // Sort by timestamp descending and limit to 20
            const finalHistory = combined
              .sort((a, b) => b.timestamp - a.timestamp)
              .slice(0, 20);
            
            localStorage.setItem("limmaster_history", JSON.stringify(finalHistory));
            return finalHistory;
          });
        }
      } catch (e) {
        console.error("Supabase load error:", e);
      }
    }
  }, []);

  const saveToHistory = React.useCallback(async (problem: string, sol: LimitSolution) => {
    const newItem: HistoryItem = {
      id: Math.random().toString(36).substr(2, 9),
      problem,
      solution: sol,
      timestamp: Date.now()
    };
    
    // Update local state and storage
    setHistory(prev => {
      const updated = [newItem, ...prev.filter(h => h.problem !== problem)].slice(0, 20);
      localStorage.setItem("limmaster_history", JSON.stringify(updated));
      return updated;
    });

    // Save to Supabase if available
    if (supabase) {
      try {
        await supabase.from('history').insert([
          { 
            problem, 
            solution: sol, 
            timestamp: new Date(newItem.timestamp).toISOString() 
          }
        ]);
      } catch (e) {
        console.error("Supabase save error:", e);
      }
    }
  }, []);

  const clearHistory = React.useCallback(async () => {
    setHistory([]);
    localStorage.removeItem("limmaster_history");
    
    if (supabase) {
      try {
        // In a real app, we'd probably only clear for the current user
        // For now, we'll just clear local state as a full DB clear might be destructive
        console.log("History cleared locally. Supabase history remains for other sessions.");
      } catch (e) {
        console.error("Supabase clear error:", e);
      }
    }
  }, []);

  const loadExercises = React.useCallback(async () => {
    setIsGenerating(true);
    try {
      const difficulty = selectedDifficulty === "all" ? undefined : selectedDifficulty;
      const topic = selectedTopic === "all" ? undefined : selectedTopic;
      const data = await generateExercises(3, difficulty, topic);
      setExercises(data);

      // Save generated exercises to Supabase for global access/reference
      if (supabase && data.length > 0) {
        try {
          await supabase.from('exercises').upsert(
            data.map(ex => ({
              problem: ex.problem,
              difficulty: ex.difficulty,
              topic: ex.topic,
              created_at: new Date().toISOString()
            })),
            { onConflict: 'problem' }
          );
        } catch (e) {
          console.error("Supabase exercise save error:", e);
        }
      }
    } catch (err) {
      console.error("Failed to generate exercises:", err);
      // Fallback to static exercises if API fails (e.g., rate limit)
      setExercises([
        { problem: "\\lim_{x \\to 0} \\frac{\\sin x}{x}", difficulty: "Easy", topic: "លីមីតត្រីកោណមាត្រ" },
        { problem: "\\lim_{x \\to \\infty} \\frac{2x^2 + 3}{x^2 - 1}", difficulty: "Medium", topic: "លីមីតអនន្ត" },
        { problem: "\\lim_{x \\to 1} \\frac{x^2 - 1}{x - 1}", difficulty: "Easy", topic: "លីមីតរាងមិនកំណត់" }
      ]);
    } finally {
      setIsGenerating(false);
    }
  }, [selectedDifficulty, selectedTopic]);

  const handleSolve = React.useCallback(async (problem?: string) => {
    const targetProblem = problem || inputProblem;
    if (!targetProblem.trim()) return;

    setIsLoading(true);
    setError(null);
    setSolution(null);
    setActiveTab("solver"); // Always switch to solver tab to show progress/result

    try {
      const result = await solveLimit(targetProblem);
      setSolution(result);
      saveToHistory(targetProblem, result);
    } catch (err: any) {
      let errorMessage = "ការដោះស្រាយលីមីតបានបរាជ័យ។ សូមពិនិត្យមើលការបញ្ចូលរបស់អ្នក ហើយព្យាយាមម្តងទៀត។";
      
      // Check for rate limit error (429)
      if (err?.message?.includes("429") || err?.status === 429 || JSON.stringify(err).includes("429")) {
        errorMessage = "សុំទោស! ប្រព័ន្ធកំពុងមមាញឹកខ្លាំង (Quota Exceeded)។ សូមរង់ចាំមួយភ្លែត រួចព្យាយាមម្តងទៀត។";
      }
      
      setError(errorMessage);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [inputProblem, saveToHistory]);

  useEffect(() => {
    loadExercises();
    loadHistory();
  }, [loadExercises, loadHistory]);

  const captureAndScan = async () => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        setIsScanning(true);
        setError(null);
        try {
          // Create a canvas to crop the image to the central area for better clarity
          const image = new Image();
          image.src = imageSrc;
          await new Promise((resolve) => (image.onload = resolve));

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            // Define crop area (central 70% of the image to match visual guide)
            const cropWidth = image.width * 0.7;
            const cropHeight = image.height * 0.5;
            const startX = (image.width - cropWidth) / 2;
            const startY = (image.height - cropHeight) / 2;

            canvas.width = cropWidth;
            canvas.height = cropHeight;
            ctx.drawImage(image, startX, startY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
            
            const croppedImageSrc = canvas.toDataURL('image/jpeg', 0.9);
            const extractedText = await scanLimitFromImage(croppedImageSrc);
            
            if (extractedText && extractedText.length > 0) {
              setInputProblem(extractedText);
              setInputMode("latex"); // Switch to LaTeX mode to show preview
            } else {
              setError("មិនអាចស្រង់លំហាត់ចេញពីជារូបភាពបានទេ។ សូមព្យាយាមម្តងទៀត។");
            }
          }
        } catch (err) {
          console.error("Scan error:", err);
          setError("មានកំហុសក្នុងការស្កេនរូបភាព។");
        } finally {
          setIsScanning(false);
        }
      }
    }
  };

  // Automatically try to focus the camera when scan mode is active
  useEffect(() => {
    if (inputMode === "scan" && webcamRef.current) {
      const video = webcamRef.current.video;
      if (video && video.srcObject) {
        const stream = video.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        if (track && track.applyConstraints) {
          // Try to apply continuous focus if supported by the browser/hardware
          track.applyConstraints({
            advanced: [{ focusMode: 'continuous' } as any]
          }).catch(() => {
            // Silently fail if focusMode is not supported
          });
        }
      }
    }
  }, [inputMode]);

  const handleFeedbackSubmit = async () => {
    if (!feedbackText.trim()) return;
    setIsSubmittingFeedback(true);
    
    try {
      if (supabase) {
        const { error } = await supabase.from('feedback').insert([
          { 
            type: feedbackType, 
            text: feedbackText, 
            timestamp: new Date().toISOString() 
          }
        ]);
        if (error) throw error;
      } else {
        // Fallback for demo if Supabase not configured
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      setFeedbackSubmitted(true);
      setFeedbackText("");
      setTimeout(() => setFeedbackSubmitted(false), 3000);
    } catch (e) {
      console.error("Feedback submission error:", e);
      // Still show success in UI for better UX, or could show error toast
      setFeedbackSubmitted(true);
      setFeedbackText("");
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const toggleTheme = () => {
    setTheme(prev => prev === "light" ? "dark" : "light");
  };

  const difficultyMap: Record<string, string> = {
    "Easy": "ងាយស្រួល",
    "Medium": "មធ្យម",
    "Hard": "ពិបាក"
  };

  return (
    <div className="min-h-screen bg-background font-sans text-foreground transition-colors duration-300">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md" id="main-header">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 max-w-5xl">
          <div className="flex items-center gap-2" id="brand-logo">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20">
              <Calculator size={20} className="sm:w-6 sm:h-6" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">LimMaster</h1>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">កម្មវិធីដោះស្រាយលីមីត</p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={toggleTheme}
              className="h-9 w-9 text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </Button>
            <Sheet>
              <SheetTrigger
                render={
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30" />
                }
              >
                <History size={18} />
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-md p-0 flex flex-col bg-background border-border">
                <SheetHeader className="p-6 border-b border-border">
                  <div className="flex items-center justify-between">
                    <SheetTitle className="flex items-center gap-2">
                      <History className="h-5 w-5 text-indigo-500" />
                      ប្រវត្តិនៃការដោះស្រាយ
                    </SheetTitle>
                    {history.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={clearHistory} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 h-8 px-2">
                        <Trash2 className="h-4 w-4 mr-1" /> លុបទាំងអស់
                      </Button>
                    )}
                  </div>
                  <SheetDescription>
                    មើលលំហាត់ដែលអ្នកបានដោះស្រាយកន្លងមក
                  </SheetDescription>
                </SheetHeader>
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-3">
                    {history.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-center">
                        <Clock className="h-12 w-12 mb-4 opacity-20" />
                        <p className="text-sm font-medium">មិនទាន់មានប្រវត្តិនៅឡើយទេ</p>
                        <p className="text-xs mt-1">រាល់លំហាត់ដែលអ្នកដោះស្រាយនឹងបង្ហាញនៅទីនេះ</p>
                      </div>
                    ) : (
                      history.map((item) => (
                        <Card 
                          key={item.id} 
                          className="border-border bg-card hover:border-indigo-200 dark:hover:border-indigo-800 hover:shadow-md transition-all cursor-pointer group"
                          onClick={() => {
                            setSolution(item.solution);
                            setInputProblem(item.problem);
                            setActiveTab("solver");
                          }}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 overflow-hidden">
                                <div className="text-sm font-mono text-foreground mb-3 py-2 overflow-x-auto">
                                  <InlineMath math={item.problem} />
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary" className="bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold">
                                    លទ្ធផល៖ <InlineMath math={item.solution.finalAnswer} />
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground">
                                    {new Date(item.timestamp).toLocaleDateString('km-KH')}
                                  </span>
                                </div>
                              </div>
                              <div className="bg-muted p-2 rounded-lg group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/30 group-hover:text-indigo-600 transition-colors">
                                <ArrowRight size={16} />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
            <Badge variant="outline" className="hidden sm:flex bg-muted text-muted-foreground border-border">
              <Brain className="mr-1 h-3 w-3" /> ប្រើប្រាស់ AI
            </Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-5xl p-3 sm:p-6 lg:p-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6 sm:space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <TabsList className="grid w-full sm:w-[400px] grid-cols-2 bg-muted/50 p-1 h-11 sm:h-10">
              <TabsTrigger value="solver" className="text-sm sm:text-base data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Send className="mr-2 h-4 w-4" /> អ្នកដោះស្រាយ
              </TabsTrigger>
              <TabsTrigger value="practice" className="text-sm sm:text-base data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <BookOpen className="mr-2 h-4 w-4" /> ការអនុវត្ត
              </TabsTrigger>
            </TabsList>
            
            {activeTab === "practice" && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={loadExercises} 
                disabled={isGenerating}
                className="border-border hover:bg-muted"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
                លំហាត់ថ្មីៗ
              </Button>
            )}
          </div>

          {/* Solver Tab */}
          <TabsContent value="solver" className="space-y-8 outline-none">
            <Card className="border-border shadow-sm overflow-hidden bg-card">
              <CardHeader className="bg-muted/50 border-b border-border p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-indigo-500" />
                    បញ្ចូលលំហាត់លីមីត
                  </CardTitle>
                  <div className="flex bg-muted p-1 rounded-lg w-fit">
                    <Button 
                      variant={inputMode === "simple" ? "secondary" : "ghost"} 
                      size="sm" 
                      onClick={() => setInputMode("simple")}
                      className="h-7 px-2 sm:px-3 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider"
                    >
                      <TypeIcon className="h-3 w-3 mr-1" /> អត្ថបទ
                    </Button>
                    <Button 
                      variant={inputMode === "latex" ? "secondary" : "ghost"} 
                      size="sm" 
                      onClick={() => setInputMode("latex")}
                      className="h-7 px-2 sm:px-3 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider"
                    >
                      <Sigma className="h-3 w-3 mr-1" /> LaTeX
                    </Button>
                    <Button 
                      variant={inputMode === "scan" ? "secondary" : "ghost"} 
                      size="sm" 
                      onClick={() => setInputMode("scan")}
                      className="h-7 px-2 sm:px-3 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider"
                    >
                      <Camera className="h-3 w-3 mr-1" /> ស្កេន
                    </Button>
                  </div>
                </div>
                <CardDescription className="text-xs sm:text-sm mt-2">
                  {inputMode === "simple" && "វាយបញ្ចូលលំហាត់លីមីតរបស់អ្នកជាអត្ថបទធម្មតា"}
                  {inputMode === "latex" && "វាយបញ្ចូលកូដ LaTeX សម្រាប់លំហាត់ស្មុគស្មាញ"}
                  {inputMode === "scan" && "ប្រើប្រាស់កាមេរ៉ាដើម្បីស្កេនលំហាត់ចេញពីសៀវភៅ"}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 space-y-4">
                {inputMode === "simple" ? (
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Input 
                        id="problem-input-simple"
                        placeholder="ឧទាហរណ៍៖ lim x->0 sin(x)/x" 
                        value={inputProblem}
                        onChange={(e) => setInputProblem(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSolve()}
                        className="h-12 sm:h-14 text-base sm:text-lg font-mono border-border focus-visible:ring-indigo-500 pl-4 pr-12"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground/30">
                        <Calculator size={18} />
                      </div>
                    </div>
                    <Button 
                      id="solve-button-simple"
                      onClick={() => handleSolve()} 
                      disabled={isLoading || !inputProblem.trim()}
                      className="h-12 sm:h-14 px-6 sm:px-10 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-100 dark:shadow-indigo-900/20 transition-all font-bold text-sm sm:text-base"
                    >
                      {isLoading ? <Loader2 className="mr-2 h-4 w-4 sm:h-5 sm:w-5 animate-spin" /> : <Send className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />}
                      ដោះស្រាយ
                    </Button>
                  </div>
                ) : inputMode === "latex" ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-muted-foreground">កូដ LaTeX</label>
                        <Textarea 
                          id="problem-input-latex"
                          placeholder="\lim_{x \to 0} \frac{\sin x}{x}"
                          value={inputProblem}
                          onChange={(e) => setInputProblem(e.target.value)}
                          className="min-h-[100px] sm:min-h-[120px] font-mono text-sm sm:text-base border-border focus-visible:ring-indigo-500 p-3 sm:p-4"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-muted-foreground">មើលមុន (Preview)</label>
                        <div className="min-h-[120px] sm:min-h-[150px] border border-border bg-muted/30 rounded-xl flex items-center justify-center p-4 sm:p-6 overflow-auto">
                          {inputProblem.trim() ? (
                            <motion.div
                              key={inputProblem}
                              initial={{ opacity: 0, scale: 0.98 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ duration: 0.2 }}
                              className="max-w-full overflow-x-auto py-4"
                            >
                              <BlockMath math={inputProblem} />
                            </motion.div>
                          ) : (
                            <span className="text-muted-foreground text-xs sm:text-sm italic">បង្ហាញរូបមន្តនៅទីនេះ...</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button 
                        id="solve-button-latex"
                        onClick={() => handleSolve()} 
                        disabled={isLoading || !inputProblem.trim()}
                        className="w-full sm:w-auto h-11 sm:h-12 px-8 sm:px-12 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-100 dark:shadow-indigo-900/20 transition-all font-bold text-sm sm:text-base"
                      >
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 sm:h-5 sm:w-5 animate-spin" /> : <Send className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />}
                        ដោះស្រាយលំហាត់ LaTeX
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="relative aspect-square sm:aspect-video max-w-2xl mx-auto overflow-hidden rounded-2xl border-2 border-dashed border-border bg-muted/30 flex flex-col items-center justify-center group">
                      <Webcam
                        audio={false}
                        ref={webcamRef}
                        screenshotFormat="image/jpeg"
                        videoConstraints={{ 
                          facingMode: "environment",
                          width: { ideal: 1920 },
                          height: { ideal: 1080 },
                          focusMode: "continuous"
                        } as any}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 pointer-events-none border-2 border-indigo-500/50 m-4 sm:m-8 rounded-lg flex items-center justify-center">
                         <div className="w-full h-0.5 bg-indigo-500/30 animate-scan-line absolute top-0" />
                         <Scan className="h-8 w-8 sm:h-12 sm:w-12 text-indigo-500/50" />
                      </div>
                      
                      {isScanning && (
                        <div className="absolute inset-0 bg-background/60 backdrop-blur-sm flex flex-col items-center justify-center z-10 p-4 text-center">
                          <Loader2 className="h-10 w-10 sm:h-12 sm:w-12 animate-spin text-indigo-500 mb-4" />
                          <p className="text-xs sm:text-sm font-bold text-foreground animate-pulse">កំពុងស្កេន និងស្រង់ទិន្នន័យ...</p>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex justify-center gap-4">
                      <Button 
                        id="capture-scan-button"
                        onClick={captureAndScan} 
                        disabled={isScanning}
                        className="w-full sm:w-auto h-11 sm:h-12 px-8 sm:px-12 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-100 dark:shadow-indigo-900/20 transition-all font-bold text-sm sm:text-base"
                      >
                        <Camera className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                        ថតរូប និងស្កេន
                      </Button>
                    </div>
                    <p className="text-center text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-widest">
                      ដាក់លំហាត់ឱ្យចំកណ្តាលប្រអប់ ដើម្បីទទួលបានលទ្ធផលល្អបំផុត
                    </p>
                  </div>
                ) }
              </CardContent>
            </Card>

            <AnimatePresence mode="wait">
              {isLoading && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex flex-col items-center justify-center py-24 text-muted-foreground"
                >
                  <div className="relative mb-6">
                    <div className="absolute inset-0 bg-indigo-500/20 blur-2xl rounded-full animate-pulse" />
                    <Loader2 className="h-16 w-16 animate-spin text-indigo-500 relative z-10" />
                    <Brain className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-indigo-600 z-20" />
                  </div>
                  <p className="text-base font-bold text-foreground animate-pulse">កំពុងវិភាគរចនាសម្ព័ន្ធគណិតវិទ្យា...</p>
                  <p className="text-sm mt-2 text-muted-foreground">កំពុងអនុវត្តទ្រឹស្តីបទ និងច្បាប់គណនា</p>
                </motion.div>
              )}

              {error && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-6 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-start gap-4 text-destructive shadow-sm"
                >
                  <div className="bg-destructive/10 p-2 rounded-lg">
                    <AlertCircle className="h-6 w-6 shrink-0" />
                  </div>
                  <div>
                    <p className="font-bold text-lg">កំហុសក្នុងការគណនា</p>
                    <p className="text-sm opacity-90 mt-1">{error}</p>
                    <Button variant="outline" size="sm" className="mt-4 border-destructive/20 text-destructive hover:bg-destructive/10" onClick={() => handleSolve()}>
                      ព្យាយាមម្តងទៀត
                    </Button>
                  </div>
                </motion.div>
              )}

              {solution && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="grid grid-cols-1 lg:grid-cols-12 gap-8"
                >
                  {/* Problem Summary Column */}
                  <div className="lg:col-span-4 space-y-6">
                    <Card className="border-border shadow-sm sticky top-24 overflow-hidden bg-card">
                      <CardHeader className="bg-muted/50 border-b border-border">
                        <div className="flex items-center gap-2 mb-2">
                          <Target className="h-4 w-4 text-indigo-500" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">លំហាត់ដែលបានបញ្ចូល</span>
                        </div>
                        <div className="py-8 px-4 flex justify-center bg-background rounded-xl border border-border shadow-inner overflow-x-auto min-h-[120px] items-center">
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="max-w-full"
                          >
                            <BlockMath math={solution.problem} />
                          </motion.div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-6 space-y-4">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">ចំនួនជំហាន</span>
                          <Badge variant="secondary" className="bg-muted text-foreground font-mono">{solution.steps.length}</Badge>
                        </div>
                        <Separator className="bg-border" />
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">លទ្ធផលចុងក្រោយ</p>
                          <div className="p-4 bg-indigo-600 rounded-xl text-white text-center shadow-lg shadow-indigo-100 dark:shadow-indigo-900/20">
                            <motion.div 
                              className="text-2xl font-bold"
                              initial={{ scale: 0.9 }}
                              animate={{ scale: 1 }}
                              transition={{ 
                                type: "spring",
                                stiffness: 260,
                                damping: 20,
                                delay: 0.4
                              }}
                            >
                              <InlineMath math={solution.finalAnswer} />
                            </motion.div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Steps Column */}
                  <div className="lg:col-span-8 space-y-6">
                    <div className="flex items-center justify-between px-2">
                      <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                        <ListChecks className="h-5 w-5 text-indigo-500" />
                        ដំណោះស្រាយលម្អិត
                      </h2>
                      <Badge variant="outline" className="border-indigo-100 dark:border-indigo-900 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30">
                        {solution.steps.length} ជំហាន
                      </Badge>
                    </div>

                    <Accordion className="space-y-4" id="solution-steps-accordion">
                      {solution.steps.map((step, idx) => (
                        <AccordionItem 
                          key={`step-${idx}`} 
                          value={`step-${idx}`}
                          className="border border-border bg-card rounded-2xl overflow-hidden shadow-sm data-[state=open]:shadow-md transition-all px-0"
                        >
                          <AccordionTrigger className="hover:no-underline px-6 py-5 hover:bg-muted/50 transition-colors">
                            <div className="flex items-center gap-4 text-left">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-100 dark:border-indigo-900">
                                {idx + 1}
                              </div>
                              <div>
                                <h3 className="font-bold text-foreground leading-tight">{step.title}</h3>
                                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mt-1">ជំហានទី {idx + 1}</p>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-6 pb-6 pt-2">
                            <div className="space-y-6 pl-14">
                              <div className="relative">
                                <div className="absolute -left-7 top-0 bottom-0 w-0.5 bg-indigo-100 dark:bg-indigo-900 rounded-full" />
                                <p className="text-muted-foreground text-sm leading-relaxed">
                                  {step.explanation}
                                </p>
                              </div>
                              <div className="bg-muted/30 border border-border rounded-2xl p-6 shadow-inner overflow-x-auto flex justify-center group relative">
                                <div className="absolute top-3 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Badge variant="outline" className="bg-background text-[9px] font-bold text-muted-foreground border-border">រូបមន្ត</Badge>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-7 w-7 bg-background shadow-sm border border-border hover:bg-muted"
                                    onClick={() => copyToClipboard(step.formula, `step-${idx}`)}
                                  >
                                    {copiedId === `step-${idx}` ? (
                                      <Check className="h-3 w-3 text-emerald-500" />
                                    ) : (
                                      <Copy className="h-3 w-3 text-muted-foreground" />
                                    )}
                                  </Button>
                                </div>
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.95 }}
                                  whileInView={{ opacity: 1, scale: 1 }}
                                  viewport={{ once: true }}
                                  transition={{ duration: 0.3 }}
                                >
                                  <BlockMath math={step.formula} />
                                </motion.div>
                              </div>
                              {idx < solution.steps.length - 1 && (
                                <div className="flex justify-center">
                                  <div className="bg-indigo-50 dark:bg-indigo-950/50 p-1.5 rounded-full text-indigo-400 dark:text-indigo-600">
                                    <ArrowRight className="h-4 w-4 rotate-90" />
                                  </div>
                                </div>
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>

                    {/* Final Result Card (Mobile Only or Bottom) */}
                    <Card className="border-none bg-indigo-600 text-white shadow-xl shadow-indigo-200 dark:shadow-indigo-900/20 overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
                      <div className="absolute bottom-0 left-0 w-24 h-24 bg-indigo-400/20 rounded-full -ml-12 -mb-12 blur-xl" />
                      <CardContent className="p-10 flex flex-col items-center text-center relative z-10">
                        <div className="bg-white/20 p-3 rounded-2xl mb-4 backdrop-blur-sm">
                          <CheckCircle2 size={32} />
                        </div>
                        <p className="text-indigo-100 uppercase tracking-[0.2em] font-bold text-[10px] mb-2">សរុបលទ្ធផលចុងក្រោយ</p>
                        <div className="text-4xl font-bold tracking-tight">
                          <InlineMath math={solution.finalAnswer} />
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>

          {/* Practice Tab */}
          <TabsContent value="practice" className="outline-none space-y-6">
            <Card className="border-border shadow-sm bg-card overflow-hidden">
              <CardHeader className="bg-muted/50 border-b border-border py-4">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-indigo-500" />
                  <CardTitle className="text-sm font-bold">តម្រងលំហាត់</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Layers className="h-3 w-3" /> កម្រិតពិបាក
                    </label>
                    <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue placeholder="ជ្រើសរើសកម្រិត" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">ទាំងអស់</SelectItem>
                        <SelectItem value="Easy">ងាយស្រួល</SelectItem>
                        <SelectItem value="Medium">មធ្យម</SelectItem>
                        <SelectItem value="Hard">ពិបាក</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <BookOpen className="h-3 w-3" /> ប្រធានបទ
                    </label>
                    <Select value={selectedTopic} onValueChange={setSelectedTopic}>
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue placeholder="ជ្រើសរើសប្រធានបទ" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">ទាំងអស់</SelectItem>
                        <SelectItem value="លីមីតត្រីកោណមាត្រ">លីមីតត្រីកោណមាត្រ</SelectItem>
                        <SelectItem value="លីមីតអនន្ត">លីមីតអនន្ត</SelectItem>
                        <SelectItem value="លីមីតរាងមិនកំណត់">លីមីតរាងមិនកំណត់</SelectItem>
                        <SelectItem value="ច្បាប់ L'Hopital">ច្បាប់ L'Hopital</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button 
                    onClick={loadExercises} 
                    disabled={isGenerating}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-100 dark:shadow-indigo-900/20"
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
                    បង្កើតលំហាត់ថ្មី
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6" id="exercises-grid">
              {isGenerating ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Card key={`skeleton-${i}`} className="border-border animate-pulse bg-card">
                    <div className="h-40 bg-muted rounded-t-xl" />
                    <div className="p-4 space-y-3">
                      <div className="h-4 bg-muted rounded w-3/4" />
                      <div className="h-3 bg-muted rounded w-1/2" />
                    </div>
                  </Card>
                ))
              ) : (
                exercises.map((ex, idx) => (
                  <motion.div
                    key={`exercise-${idx}-${ex.problem.slice(0, 10)}`}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.1 }}
                  >
                    <Card className="border-border bg-card shadow-sm hover:shadow-md transition-all group overflow-hidden h-full flex flex-col">
                      <div className="bg-muted/30 p-8 flex justify-center items-center min-h-[140px] border-b border-border overflow-x-auto">
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: idx * 0.1 + 0.2 }}
                          className="max-w-full"
                        >
                          <BlockMath math={ex.problem} />
                        </motion.div>
                      </div>
                      <CardContent className="p-4 flex-1">
                        <div className="flex items-center justify-between mb-3">
                          <Badge 
                            variant="outline" 
                            className={`
                              ${ex.difficulty === 'Easy' ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900' : ''}
                              ${ex.difficulty === 'Medium' ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900' : ''}
                              ${ex.difficulty === 'Hard' ? 'text-rose-600 bg-rose-50 dark:bg-rose-950/30 border-rose-100 dark:border-rose-900' : ''}
                            `}
                          >
                            {difficultyMap[ex.difficulty] || ex.difficulty}
                          </Badge>
                          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{ex.topic}</span>
                        </div>
                      </CardContent>
                      <CardFooter className="p-4 pt-0">
                        <Button 
                          variant="ghost" 
                          className="w-full justify-between group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/30 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 border border-transparent group-hover:border-indigo-100 dark:group-hover:border-indigo-900"
                          onClick={() => handleSolve(ex.problem)}
                        >
                          មើលដំណោះស្រាយ
                          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </Button>
                      </CardFooter>
                    </Card>
                  </motion.div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer Info */}
      <footer className="mt-12 sm:mt-20 border-t border-border py-8 sm:py-12 bg-card">
        <div className="container mx-auto px-4 max-w-5xl text-center space-y-4 sm:space-y-6">
          <div className="flex justify-center gap-4 sm:gap-6">
            <div className="flex flex-col items-center">
              <span className="text-xl sm:text-2xl font-bold text-foreground">∞</span>
              <span className="text-[8px] sm:text-[10px] uppercase font-bold text-muted-foreground tracking-widest">គាំទ្រអនន្ត</span>
            </div>
            <Separator orientation="vertical" className="h-8 sm:h-10 bg-border" />
            <div className="flex flex-col items-center">
              <span className="text-xl sm:text-2xl font-bold text-foreground">dx</span>
              <span className="text-[8px] sm:text-[10px] uppercase font-bold text-muted-foreground tracking-widest">ច្បាប់គណនា</span>
            </div>
            <Separator orientation="vertical" className="h-8 sm:h-10 bg-border" />
            <div className="flex flex-col items-center">
              <span className="text-xl sm:text-2xl font-bold text-foreground">π</span>
              <span className="text-[8px] sm:text-[10px] uppercase font-bold text-muted-foreground tracking-widest">ត្រីកោណមាត្រ</span>
            </div>
          </div>
          <p className="text-muted-foreground text-[11px] sm:text-xs max-w-md mx-auto leading-relaxed px-2">
            LimMaster ប្រើប្រាស់ AI កម្រិតខ្ពស់ដើម្បីបំបែកលីមីតស្មុគស្មាញទៅជាជំហានៗដែលងាយយល់។
            ស័ក្តិសមបំផុតសម្រាប់សិស្សានុសិស្ស និងគ្រូបង្រៀន។
          </p>
          <div className="pt-2 sm:pt-4">
            <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-muted-foreground/50">
              Created by samrithy narongrod & AI កម្រិតខ្ពស់
            </p>
          </div>
        </div>
      </footer>

      {/* Feedback Floating Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <Dialog>
          <DialogTrigger
            render={
              <Button 
                size="icon" 
                className="h-14 w-14 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-200 dark:shadow-indigo-900/20 group"
              />
            }
          >
            <MessageSquare className="h-6 w-6 transition-transform group-hover:scale-110" />
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px] bg-background border-border">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-foreground">
                <MessageSquare className="h-5 w-5 text-indigo-500" />
                មតិកែលម្អ
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                ជួយយើងឱ្យកាន់តែប្រសើរឡើង! ប្រាប់យើងពីអ្វីដែលអ្នកពេញចិត្ត ឬបញ្ហាដែលអ្នកបានជួប។
              </DialogDescription>
            </DialogHeader>
            
            {feedbackSubmitted ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                <div className="h-16 w-16 bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center">
                  <ThumbsUp className="h-8 w-8" />
                </div>
                <div>
                  <h4 className="font-bold text-foreground">អរគុណសម្រាប់ការផ្តល់មតិ!</h4>
                  <p className="text-sm text-muted-foreground mt-1">មតិរបស់អ្នកមានតម្លៃណាស់សម្រាប់យើង។</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-3 gap-2">
                  <Button 
                    variant={feedbackType === "suggestion" ? "secondary" : "outline"}
                    className={`h-20 flex flex-col gap-2 ${feedbackType === "suggestion" ? "border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400" : "border-border"}`}
                    onClick={() => setFeedbackType("suggestion")}
                  >
                    <Lightbulb className="h-5 w-5" />
                    <span className="text-[10px] font-bold">សំណូមពរ</span>
                  </Button>
                  <Button 
                    variant={feedbackType === "bug" ? "secondary" : "outline"}
                    className={`h-20 flex flex-col gap-2 ${feedbackType === "bug" ? "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400" : "border-border"}`}
                    onClick={() => setFeedbackType("bug")}
                  >
                    <Bug className="h-5 w-5" />
                    <span className="text-[10px] font-bold">បញ្ហាបច្ចេកទេស</span>
                  </Button>
                  <Button 
                    variant={feedbackType === "other" ? "secondary" : "outline"}
                    className={`h-20 flex flex-col gap-2 ${feedbackType === "other" ? "border-border bg-muted text-foreground" : "border-border"}`}
                    onClick={() => setFeedbackType("other")}
                  >
                    <MessageSquare className="h-5 w-5" />
                    <span className="text-[10px] font-bold">ផ្សេងៗ</span>
                  </Button>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-foreground">រៀបរាប់លម្អិត</label>
                  <Textarea 
                    placeholder="សរសេរមតិរបស់អ្នកនៅទីនេះ..." 
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    className="min-h-[120px] resize-none bg-background border-border text-foreground"
                  />
                </div>
              </div>
            )}
            
            <DialogFooter className="border-t border-border pt-4">
              {!feedbackSubmitted && (
                <Button 
                  onClick={handleFeedbackSubmit} 
                  disabled={isSubmittingFeedback || !feedbackText.trim()}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                >
                  {isSubmittingFeedback ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      កំពុងបញ្ជូន...
                    </>
                  ) : (
                    "បញ្ជូនមតិ"
                  )}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
