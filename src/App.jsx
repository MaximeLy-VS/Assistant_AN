import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Upload, Image as ImageIcon, Copy, Check, AlertCircle, Loader2, Info } from 'lucide-react';
import backgroundImage from './assets/Background.jpg';

// --- CONFIGURATION API ---
// L'environnement d'exécution de test (ici) injecte la clé automatiquement si elle est vide.
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;


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
    console.error('Erreur lors de la copie', err);
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
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
      title="Copier le texte"
    >
      {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
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
      setError("Erreur de configuration : Clé API introuvable. Vérifiez vos secrets sur GitHub.");
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
      console.error("Erreur d'analyse:", err);
      setError("Une erreur est survenue lors de l'analyse. Vérifiez vos quotas ou votre clé API.");
    } finally {
      setLoading(false);
    }
  };

  const fetchWithRetry = async (base64Data, mimeType, maxRetries = 3) => {
    const delays = [1000, 2000, 4000];
    
    // PROMPT OPTIMISÉ AVEC VOS PRÉCONISATIONS ET RGAA
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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const data = await response.json();
        return JSON.parse(data.candidates[0].content.parts[0].text);
      } catch (err) {
        if (i === maxRetries - 1) throw err;
        await new Promise(r => setTimeout(r, delays[i]));
      }
    }
  };

  return (
<div className="min-h-screen flex items-center justify-center p-4 font-sans text-slate-900 bg-cover bg-center bg-no-repeat bg-fixed">
        style={{ backgroundImage: `url(${backgroundImage})` }}>
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
  <div className="max-w-6xl bg-white rounded-[2.5rem] shadow-2xl shadow-indigo-100 overflow-hidden flex flex-col md:flex-row border border-slate-100 animate-fade-slide-up">
    <div className="bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="grid md:grid-cols-12 gap-8 items-start">
          <div className="md:col-span-5 space-y-4">
            <header className="mb-8 animate-fade-slide-up">
              <div className="flex items-center gap-4 mb-3">
                <div className="p-3 bg-indigo-600 rounded-2xl shadow-xl shadow-indigo-200">
                  <ImageIcon className="text-white" size={24} />
                </div>
                <div className="">
                  <h1 className="text-4x3 font-black tracking-tight text-slate-800">Assistant accessibilité des images</h1>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em]">Générez des alternatives et descriptions</p>
                </div>
              </div>
            </header>

            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files[0]); }}
              className={`relative flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-3xl transition-all bg-white
                ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300'}
                ${previewUrl ? 'border-solid p-4' : 'hover:border-slate-400 cursor-pointer'}
              `}
              onClick={() => !previewUrl && document.getElementById('file-input').click()}
            >
              <input id="file-input" type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />

              {previewUrl ? (
                <div className="w-full space-y-4">
                  <div className="relative group cursor-pointer" onClick={() => document.getElementById('file-input').click()}>
                    <img src={previewUrl} alt="Preview" className="max-h-[300px] mx-auto rounded-xl shadow-md" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl text-white font-medium">
                      Changer l'image
                    </div>
                  </div>
                  
                  <button
                    onClick={(e) => { e.stopPropagation(); processImage(file); }}
                    disabled={loading}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md disabled:bg-slate-300 flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="animate-spin" /> : <ImageIcon size={20} />}
                    {loading ? "Analyse..." : "Lancer l'analyse"}
                  </button>
                </div>
              ) : (
                <div className="text-center py-12 space-y-4">
                  <Upload className="mx-auto text-slate-400" size={48} />
                  <p className="text-slate-500">Glissez une image ou cliquez ici</p>
                </div>
              )}
            </div>

            {error && <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 text-sm flex gap-2"><AlertCircle size={16} />{error}</div>}
          </div>

          <div className="md:col-span-7">
            {result ? (
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden divide-y divide-slate-100">
                <div className="p-6 bg-slate-50/50 flex justify-between items-center">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${result.complexite === 'SIMPLE' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>
                    IMAGE {result.complexite}
                  </span>
                </div>

                <div className="p-6 space-y-6">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center"><h3 className="text-xs font-bold text-slate-400 uppercase">1. Titre</h3><CopyButton text={result.titre} /></div>
                    <div className="p-3 bg-slate-50 rounded-lg font-medium">{result.titre}</div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xs font-bold text-slate-400 uppercase">2. Alternative (alt)</h3>
                      <CopyButton text={result.alternative_textuelle} />
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">{result.alternative_textuelle}</div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                      <Info size={12} />
                      {result.alternative_textuelle.length} caractères 
                      {result.alternative_textuelle.length > 125 && " (Attention : dépasse la limite Moodle)"}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xs font-bold text-slate-400 uppercase">3. Description détaillée</h3>
                      <CopyButton text={result.description_detaillee} />
                    </div>
                    <div className="p-4 bg-slate-50 rounded-lg prose prose-slate prose-sm max-w-none whitespace-pre-wrap">
                      {result.description_detaillee}
                    </div>
                  </div>
                </div>
              </div>
            ) : !loading && (
              <div className="h-full min-h-[300px] border-2 border-dashed border-slate-200 rounded-3xl flex items-center justify-center text-slate-400 italic">
                En attente d'analyse...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
  );
}
