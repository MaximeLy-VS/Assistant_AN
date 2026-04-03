import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Upload, Image as ImageIcon, Copy, Check, AlertCircle, Loader2, Info } from 'lucide-react';

// --- CONFIGURATION API ---
// L'environnement d'exécution de test (ici) injecte la clé automatiquement si elle est vide.
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

// --- UTILS ---
// Fonction robuste pour copier dans le presse-papier (contournement des restrictions iframe)
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

// --- COMPOSANTS ---

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

  // Gérer le collage (Ctrl+V / Cmd+V)
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

    // Créer une URL pour la prévisualisation
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
  };

  const processImage = async (imageFile) => {
    if (!apiKey || apiKey === "") {
      setError("Erreur de configuration : Clé API introuvable ou invalide. Vérifiez vos secrets sur GitHub.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Convertir l'image en Base64
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = reader.result.split(',')[1];
          resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });

      // 2. Appel à l'API Gemini avec exponential backoff
      const response = await fetchWithRetry(base64Data, imageFile.type);
      setResult(response);

    } catch (err) {
      console.error("Erreur d'analyse:", err);
      setError("Une erreur est survenue lors de l'analyse. Vérifiez que votre clé API est bien issue de Google AI Studio.");
    } finally {
      setLoading(false);
    }
  };

  const fetchWithRetry = async (base64Data, mimeType, maxRetries = 3) => {
    const delays = [1000, 2000, 4000];
    
    const promptText = `En tant qu'expert en accessibilité numérique (normes RGAA, WCAG), analyse l'image fournie et extrais les informations suivantes pour rendre cette image accessible.

RÈGLES D'ACCESSIBILITÉ À RESPECTER STRICTEMENT :
1. Titre : Un titre concis pour l'image.
2. Alternative textuelle (alt) : 
   - Si l'image est SIMPLE (porteuse d'informations simples) : l'alternative indique le contenu visuel et textuel. Elle doit faire moins de 80 caractères (idéalement) et maximum 125 caractères.
   - Si l'image est COMPLEXE (graphique, schéma complexe, etc.) : l'alternative introduit l'image et indique qu'une description détaillée suit.
3. Description détaillée : 
   - Nécessaire pour les images complexes.
   - DOIT OBLIGATOIREMENT commencer par le titre de l'image.
   - Doit reprendre l'ensemble des informations de l'image, structurée autant que nécessaire.
   - Si l'image est très simple, indique "Non requise pour cette image simple."

Renvoie uniquement un objet JSON structuré.`;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            titre: { type: "STRING", description: "Titre concis de l'image" },
            alternative_textuelle: { type: "STRING", description: "Texte alternatif selon les règles de complexité" },
            description_detaillee: { type: "STRING", description: "Description complète structurée, commençant par le titre" }
          },
          required: ["titre", "alternative_textuelle", "description_detaillee"]
        }
      }
    };

    // Utilisation du modèle gemini-2.5-flash
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!textResult) throw new Error("Réponse vide de l'API");
        
        return JSON.parse(textResult);

      } catch (err) {
        if (i === maxRetries - 1) throw err;
        await new Promise(resolve => setTimeout(resolve, delays[i]));
      }
    }
  };

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        
        <header className="text-center space-y-3 relative">
          <div className="inline-flex items-center justify-center p-3 bg-blue-100 text-blue-700 rounded-2xl mb-2 mt-8 md:mt-0">
            <ImageIcon size={32} />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900">
            Assistant d'Accessibilité Visuelle
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Générez des textes alternatifs et des descriptions détaillées conformes aux recommandations d'accessibilité (RGAA) pour vos images et schémas.
          </p>
        </header>

        <div className="grid md:grid-cols-12 gap-8 items-start">
          
          <div className="md:col-span-5 space-y-4">
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl transition-all bg-white overflow-hidden
                ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}
                ${previewUrl ? 'min-h-[300px] border-solid border-gray-200 shadow-sm p-4' : 'min-h-[300px] hover:border-gray-400 cursor-pointer'}
              `}
              onClick={() => {
                if (!previewUrl) document.getElementById('file-input').click();
              }}
            >
              <input
                id="file-input"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFile(e.target.files[0]);
                  }
                }}
              />

              {previewUrl ? (
                <div className="w-full flex flex-col gap-4">
                  <div 
                    className="relative w-full flex flex-col group cursor-pointer"
                    onClick={() => document.getElementById('file-input').click()}
                  >
                    <img 
                      src={previewUrl} 
                      alt="Prévisualisation" 
                      className="max-h-[320px] object-contain rounded-xl w-full"
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                      <p className="text-white font-medium flex items-center gap-2">
                        <Upload size={20} />
                        Changer l'image
                      </p>
                    </div>
                  </div>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      processImage(file);
                    }}
                    disabled={loading}
                    className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={20} className="animate-spin" />
                        Analyse en cours...
                      </>
                    ) : (
                      <>
                        <ImageIcon size={20} />
                        Lancer l'analyse
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="text-center space-y-4 pointer-events-none">
                  <div className="mx-auto w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center">
                    <Upload size={28} />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-gray-800">Cliquez pour parcourir</p>
                    <p className="text-sm text-gray-500 mt-1">ou glissez-déposez une image ici</p>
                  </div>
                  <div className="text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full inline-block">
                    Astuce : Vous pouvez aussi faire Ctrl+V / Cmd+V
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="p-4 bg-red-50 text-red-700 rounded-xl flex items-start gap-3 border border-red-100">
                <AlertCircle className="shrink-0 mt-0.5" size={18} />
                <p className="text-sm">{error}</p>
              </div>
            )}
          </div>

          <div className="md:col-span-7">
            {loading ? (
              <div className="h-full min-h-[300px] bg-white border border-gray-200 rounded-2xl flex flex-col items-center justify-center p-8 shadow-sm">
                <Loader2 size={40} className="animate-spin text-blue-600 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">Analyse en cours...</h3>
                <p className="text-sm text-gray-500 text-center mt-2 max-w-sm">
                  L'IA étudie la complexité de l'image pour formuler une alternative textuelle et une description adaptées.
                </p>
              </div>
            ) : result ? (
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <Check size={20} className="text-green-600" />
                    Analyse terminée
                  </h2>
                </div>

                <div className="p-6 space-y-8">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">1. Titre de l'image</h3>
                      <CopyButton text={result.titre} />
                    </div>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-gray-800 font-medium">
                      {result.titre}
                    </div>
                  </div>

                  <div className="space-y-3 relative">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">2. Alternative textuelle (alt)</h3>
                      <CopyButton text={result.alternative_textuelle} />
                    </div>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                      <p className="text-gray-800">{result.alternative_textuelle}</p>
                    </div>
                    
                    <div className="flex items-start gap-2 mt-2">
                      <Info size={16} className={`shrink-0 mt-0.5 ${result.alternative_textuelle.length > 125 ? 'text-amber-500' : 'text-blue-500'}`} />
                      <p className="text-xs text-gray-500">
                        <strong className={result.alternative_textuelle.length > 125 ? 'text-amber-600' : 'text-green-600'}>
                          {result.alternative_textuelle.length} caractères.
                        </strong>{' '}
                        {result.alternative_textuelle.length <= 80 
                          ? "Parfait pour une image simple." 
                          : result.alternative_textuelle.length <= 125 
                            ? "Acceptable. Si l'image est complexe, vérifiez qu'elle introduit bien la description."
                            : "Attention : alternative longue. Assurez-vous qu'il s'agit bien de l'introduction d'une image complexe."}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">3. Description détaillée</h3>
                      <CopyButton text={result.description_detaillee} />
                    </div>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                      <div className="prose prose-sm max-w-none text-gray-800 whitespace-pre-wrap">
                        {result.description_detaillee}
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            ) : (
              <div className="h-full min-h-[300px] bg-white/50 border border-gray-200 border-dashed rounded-2xl flex flex-col items-center justify-center p-8 text-gray-400">
                <ImageIcon size={48} className="mb-4 opacity-50" />
                <p className="text-center max-w-sm">
                  Les résultats de l'analyse s'afficheront ici après avoir importé une image.
                </p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
