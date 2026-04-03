import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Upload, Image as ImageIcon, Copy, Check, AlertCircle, Loader2, Info } from 'lucide-react';

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
      className="p-2 text-slate-400 hover:text-indigo-600 transition-colors rounded-lg hover:bg-indigo-50"
    >
      {copied ? <Check size={18} className="text-green-600" /> : <Copy size={18} />}
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
    // Sur GitHub, assurez-vous que apiKey récupère bien la valeur de Vite
    if (!apiKey || apiKey === "") {
      setError("Clé API manquante. Sur GitHub, remplacez la ligne 7 par : const apiKey = import.meta.env.VITE_GEMINI_API_KEY.trim();");
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
      setError("Erreur d'analyse. Vérifiez votre clé API ou vos quotas.");
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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

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
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4 md:p-12 font-sans selection:bg-indigo-100">
      <div className="w-full max-w-6xl bg-white rounded-[3rem] shadow-[0_30px_100px_rgba(0,0,0,0.06)] flex flex-col md:flex-row overflow-hidden min-h-[750px]">
        
        {/* --- PARTIE GAUCHE : IMPORT ET RÉGLAGES --- */}
        <div className="md:w-1/2 p-10 md:p-16 flex flex-col border-r border-slate-50">
          
          {/* Header */}
          <div className="flex items-center gap-4 mb-12">
            <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-100">
              <ImageIcon size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800 leading-tight">Assistant Accessibilité</h1>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em]">Analyseur de contenu</p>
            </div>
          </div>

          {/* Buttons Group */}
          <div className="grid grid-cols-2 gap-4 mb-10">
            <button 
              onClick={() => document.getElementById('file-input').click()}
              className="flex items-center justify-center gap-2 py-4 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
            >
              <Upload size={18} className="text-indigo-500" /> Import
            </button>
            <button 
              onClick={() => file && processImage(file)}
              disabled={!file || loading}
              className="flex items-center justify-center gap-2 py-4 bg-slate-100 rounded-2xl text-xs font-bold text-slate-500 hover:bg-slate-200 transition-all disabled:opacity-40"
            >
              <Wand2 size={18} /> Lancer l'analyse
            </button>
          </div>

          {/* Large Upload Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files[0]); }}
            onClick={() => !file && document.getElementById('file-input').click()}
            className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-[2.5rem] transition-all p-10 relative
              ${isDragging ? 'border-indigo-400 bg-indigo-50/30' : 'border-slate-100'}
              ${!file ? 'cursor-pointer hover:border-slate-200' : ''}
            `}
          >
            <input id="file-input" type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
            
            <div className="w-20 h-20 bg-white shadow-lg shadow-slate-100 rounded-full flex items-center justify-center text-indigo-500 mb-6">
              <Upload size={32} />
            </div>
            
            <p className="text-lg font-extrabold text-slate-800 mb-1 text-center leading-tight">Déposez votre visuel</p>
            <p className="text-xs text-slate-400 text-center">PNG, JPG ou WEBP supportés</p>

            {error && (
              <div className="absolute bottom-6 left-6 right-6 p-4 bg-red-50 text-red-600 text-[11px] font-bold rounded-2xl flex items-center gap-3 border border-red-100 shadow-sm">
                <AlertCircle size={16} /> {error}
              </div>
            )}
          </div>
        </div>

        {/* --- PARTIE DROITE : APERÇU ET RÉSULTATS --- */}
        <div className="md:w-1/2 p-10 md:p-16 flex flex-col bg-[#fafbfc] justify-center items-center">
          
          <div className="w-full max-w-md space-y-10">
            
            {/* Box Aperçu avec grille */}
            <div className="aspect-square bg-white rounded-[2.5rem] shadow-[0_20px_60px_rgba(0,0,0,0.03)] flex items-center justify-center p-8 relative overflow-hidden">
              {/* Fond à points (dotted pattern) */}
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
              
              {previewUrl ? (
                <img src={previewUrl} alt="Preview" className="max-h-full max-w-full object-contain rounded-2xl z-10 shadow-sm" />
              ) : (
                <div className="text-center space-y-4 opacity-10 flex flex-col items-center">
                  <ImageIcon size={80} strokeWidth={1.5} />
                  <p className="text-sm font-black uppercase tracking-[0.3em]">Aperçu</p>
                </div>
              )}
            </div>

            {/* Status et Contenu */}
            {loading ? (
              <div className="text-center space-y-4 py-4">
                <div className="inline-flex items-center gap-3 bg-indigo-50 text-indigo-600 px-5 py-2 rounded-full text-[11px] font-black uppercase tracking-wider shadow-sm">
                  <Loader2 size={14} className="animate-spin" /> Analyse en cours...
                </div>
              </div>
            ) : result ? (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="flex flex-col items-center gap-4">
                  <div className="bg-emerald-50 text-emerald-600 px-5 py-2 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center gap-3 shadow-sm border border-emerald-100">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                    Analyse terminée
                  </div>
                  
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                    Format {file?.name.split('.').pop()} • Image {result.complexite}
                  </p>
                </div>

                {/* Carte de résultats compacte */}
                <div className="bg-white p-7 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-1.5 flex-1">
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Alternative (Alt)</p>
                      <p className="text-sm font-medium text-slate-600 leading-relaxed italic line-clamp-3">"{result.alternative_textuelle}"</p>
                    </div>
                    <CopyButton text={result.alternative_textuelle} />
                  </div>
                  
                  <div className="pt-4 border-t border-slate-50 space-y-1.5">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Titre généré</p>
                    <p className="text-xs font-bold text-slate-800">{result.titre}</p>
                  </div>
                </div>

                {/* Bouton pour la description détaillée */}
                <button 
                  onClick={() => copyToClipboard(result.description_detaillee)}
                  className="group w-full py-5 bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3"
                >
                  <Copy size={16} className="group-hover:scale-110 transition-transform" /> 
                  Copier la description détaillée
                </button>
              </div>
            ) : (
              <div className="text-center pt-4">
                <p className="text-[11px] font-black text-slate-200 uppercase tracking-[0.4em]">Maxime Lyon</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
