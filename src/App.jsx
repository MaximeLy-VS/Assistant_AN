import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Upload, Image as ImageIcon, Copy, Check, AlertCircle, Loader2, Info } from 'lucide-react';
import backgroundImage from './assets/Background.jpg';

// --- CONFIGURATION API ---
const getApiKey = () => {
  try {
    // @ts-ignore
    return import.meta.env.VITE_GEMINI_API_KEY || "";
  } catch (e) {
    return "";
  }
};
const apiKey = getApiKey();

// --- ICÔNES SVG STABLES ---
const IconUpload = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);
const IconImage = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
  </svg>
);
const IconCopy = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);
const IconCheck = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IconAlert = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);
const IconLoader = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`animate-spin ${className}`}>
    <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
  </svg>
);
const IconWand = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m2 22 1-1h3l9-9"/><path d="M11 8l3-3"/><path d="m15 4 2-2"/><path d="M20 7l2-2"/><path d="m19 11 3 3"/><path d="M16 11l2 2"/><path d="m11 16 2 2"/>
  </svg>
);

// --- UTILS ---
const copyToClipboard = (text) => {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.position = "fixed";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    return true;
  } catch (err) {
    return false;
  } finally {
    document.body.removeChild(textArea);
  }
};

const CopyButton = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (copyToClipboard(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-500 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-all"
    >
      {copied ? <IconCheck size={14} className="text-green-600" /> : <IconCopy size={14} />}
      {copied ? <span className="text-green-600">Copié</span> : 'Copier'}
    </button>
  );
};

export default function App() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          handleFile(blob);
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const handleFile = (selectedFile) => {
    if (!selectedFile || !selectedFile.type.startsWith('image/')) {
      setError("Veuillez sélectionner un fichier image valide.");
      return;
    }
    setError(null);
    setFile(selectedFile);
    setResult(null);
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
  };

  const processImage = async (imageFile) => {
    if (!apiKey || apiKey === "") {
      setError("Clé API manquante. Vérifiez vos secrets sur GitHub.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });

      const response = await fetchWithRetry(base64Data, imageFile.type);
      setResult(response);
    } catch (err) {
      setError("Erreur d'analyse. Vérifiez votre clé API.");
    } finally {
      setLoading(false);
    }
  };

  const fetchWithRetry = async (base64Data, mimeType, maxRetries = 3) => {
    const delays = [1000, 2000, 4000];
    const promptText = `Tu es un expert en accessibilité numérique (RGAA 4.1.2, WCAG 2.2). Ton rôle est d'analyser cette image pour produire des textes d'accessibilité parfaits.

Étape 1 : Détermine si l'image est SIMPLE ou COMPLEXE.
- SIMPLE : L'information peut être contenue dans une phrase courte.
- COMPLEXE : Elle contient des données, une structure (liste, titres) ou trop d'informations pour une phrase courte.

Étape 2 : Rédige selon ces consignes strictes :

1. TITRE : Un titre descriptif et court.

2. ALTERNATIVE TEXTUELLE (attribut alt) :
   - Image SIMPLE : Doit indiquer le contenu visuel et textuel. Limite idéale : 80 caractères. Limite absolue : 125 caractères. Doit être une phrase courte unique.
   - Image COMPLEXE : Doit introduire l'image, préciser son titre et mentionner explicitement qu'une description détaillée est disponible (ex: "Graphique de l'évolution des ventes, description détaillée disponible ci-après").

3. DESCRIPTION DÉTAILLÉE :
   - Obligatoire pour les images COMPLEXES.
   - Doit IMPÉRATIVEMENT commencer par le titre de l'image.
   - Doit se limiter à peu près à 400 caractères, 800 maximum si nécessaire.
   - FOCUS RGAA : Concentre-toi sur le SENS et le MESSAGE. Ne décris les formes et les couleurs QUE si elles sont porteuses d'information (ex: code couleur d'une légende). Sinon, privilégie les données et la logique.
   - Si l'image est SIMPLE : Indique "Non requise pour cette image simple."

Renvoie le résultat au format JSON.`;

    const payload = {
      contents: [{
        role: "user",
        parts: [
          { text: promptText },
          { inlineData: { mimeType: mimeType, data: base64Data } }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            titre: { type: "STRING" },
            alternative_textuelle: { type: "STRING" },
            description_detaillee: { type: "STRING" },
            complexite: { type: "STRING", enum: ["SIMPLE", "COMPLEXE"] }
          },
          required: ["titre", "alternative_textuelle", "description_detaillee", "complexite"]
        }
      }
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b:generateContent?key=${apiKey}`;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url, { method: 'POST', body: JSON.stringify(payload) });
        if (!response.ok) throw new Error();
        const data = await response.json();
        return JSON.parse(data.candidates[0].content.parts[0].text);
      } catch (err) {
        if (i === maxRetries - 1) throw err;
        await new Promise(r => setTimeout(r, delays[i]));
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 font-sans text-slate-900 bg-slate-100 bg-gradient-to-br from-indigo-50 to-slate-200" style={{ backgroundImage: `url(${backgroundImage})` }}>
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(15px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-slide-up {
          animation: fadeSlideUp 0.5s ease-in-out forwards;
        }
        .animate-fade-slide-up-delayed {
          animation: fadeSlideUp 0.5s ease-in-out 0.15s forwards;
          opacity: 0;
        }
      `}</style>

      <div className="w-full max-w-6xl bg-white rounded-[3rem] shadow-[0_30px_100px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col md:flex-row border border-slate-100 animate-fade-slide-up">
        
        {/* --- PARTIE GAUCHE : IMPORT --- */}
        <div className="md:w-[42%] p-8 md:p-12 flex flex-col border-r border-slate-50 bg-white">
          <header className="mb-10 animate-fade-slide-up">
            <div className="flex items-center gap-4 mb-3">
              <div className="p-3 bg-indigo-600 rounded-2xl shadow-xl shadow-indigo-100">
                <IconImage className="text-white" size={24} />
              </div>
              <div className="flex flex-col">
                <h1 className="text-L font-black tracking-tight text-slate-800">Assistant d'accessibilité des images</h1>
                <p className="text-slate-500 text-[10px] tracking-[0.2em]">Générez des alternatives et descriptions</p>
              </div>
            </div>
          </header>

          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files[0]); }}
            className={`flex-1 flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-[2.5rem] transition-all bg-white relative mb-6
              ${isDragging ? 'border-indigo-400 bg-indigo-50/30' : 'border-slate-100'}
              ${!file ? 'cursor-pointer hover:border-slate-200' : ''}
            `}
            onClick={() => !file && document.getElementById('file-input').click()}
          >
            <input id="file-input" type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />

            {previewUrl ? (
              <div className="w-full space-y-6">
                <div className="relative group cursor-pointer" onClick={() => document.getElementById('file-input').click()}>
                  <img src={previewUrl} alt="Preview" className="max-h-[320px] mx-auto rounded-2xl shadow-lg border border-slate-50" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl text-white text-xs font-bold tracking-widest">
                    Changer l'image
                  </div>
                </div>
                
                <button
                  onClick={(e) => { e.stopPropagation(); processImage(file); }}
                  disabled={loading}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 disabled:bg-slate-200 disabled:shadow-none transition-all flex items-center justify-center gap-3 text-xs tracking-widest"
                >
                  {loading ? <IconLoader size={18} /> : <IconWand size={18} />}
                  {loading ? "Analyse en cours..." : "Lancer l'analyse"}
                </button>
              </div>
            ) : (
              <div className="text-center py-16 space-y-4 pointer-events-none">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
                  <IconUpload size={32} />
                </div>
                <div className="space-y-1">
                  <p className="text-slate-800 font-extrabold text-lg leading-tight">Déposez votre visuel</p>
                  <p className="text-slate-400 text-xs">PNG, JPG ou WEBP • Ctrl+V supporté</p>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 text-[10px] font-bold flex gap-3 animate-fade-slide-up">
              <IconAlert size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* --- PARTIE DROITE : RÉSULTATS --- */}
        <div className="md:w-[58%] p-8 md:p-16 flex flex-col bg-[#fafbfc] justify-center">
          {result ? (
            <div className="w-full animate-fade-slide-up-delayed space-y-6">
              <div className="flex items-center gap-3 mb-4">
                <span className={`px-4 py-1.5 rounded-full text-[9px] font-black tracking-widest shadow-sm border ${
                  result.complexite === 'SIMPLE' 
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                    : 'bg-indigo-50 text-indigo-600 border-indigo-100'
                }`}>
                  Image {result.complexite}
                </span>
              </div>

              <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 divide-y divide-slate-50">
                <div className="p-8 space-y-2 text-left">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="text-[10px] font-black text-slate-300 tracking-widest">1. Titre généré</h3>
                    <CopyButton text={result.titre} />
                  </div>
                  <p className="text-base font-extrabold text-slate-800">{result.titre}</p>
                </div>

                <div className="p-8 space-y-2 text-left">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="text-[10px] font-black text-slate-300 tracking-widest">2. Alternative (alt)</h3>
                    <CopyButton text={result.alternative_textuelle} />
                  </div>
                  <p className="text-sm text-slate-600 font-medium italic leading-relaxed">"{result.alternative_textuelle}"</p>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-300 pt-1">
                    <IconCheck size={12} className={result.alternative_textuelle.length <= 125 ? "text-emerald-500" : "text-amber-500"} />
                    {result.alternative_textuelle.length} caractères 
                    {result.alternative_textuelle.length > 125 && " (Limite technique Moodle dépassée)"}
                  </div>
                </div>

                <div className="p-8 space-y-3 text-left">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="text-[10px] font-black text-slate-300 tracking-widest">3. Description détaillée</h3>
                    <CopyButton text={result.description_detaillee} />
                  </div>
                  <div className="p-5 bg-slate-50/50 rounded-2xl prose prose-slate prose-sm max-w-none text-slate-600 whitespace-pre-wrap leading-relaxed text-xs">
                    {result.description_detaillee}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center space-y-4 opacity-20">
              <div className="w-24 h-24 bg-slate-200/50 rounded-[2rem] flex items-center justify-center border-4 border-white shadow-inner">
                <IconImage size={48} className="text-slate-400" />
              </div>
              <p className="text-xs font-black uppercase tracking-[0.4em] text-slate-200">Maxime Lyon</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
