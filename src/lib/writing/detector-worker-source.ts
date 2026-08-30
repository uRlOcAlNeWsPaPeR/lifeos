/**
 * The AI-detector Web Worker, as a source string spun up from a Blob URL.
 *
 * Two ONNX text-classification models download once (~277 MB combined,
 * q8-quantized) from the HuggingFace CDN via transformers.js loaded from
 * jsDelivr, then stay cached by the browser. Every scan after that runs
 * locally — the text never leaves the machine. Ported verbatim from Klarity.
 */

export interface DetectorModel {
  id: string;
  name: string;
  hot: boolean;
  weight: number;
  aiLabel: string;
}

export const MODELS: DetectorModel[] = [
  {
    id: "onnx-community/tmr-ai-text-detector-ONNX",
    name: "tmr-ai-text-detector",
    hot: false,
    weight: 0.35,
    aiLabel: "ai",
  },
  {
    id: "onnx-community/answerdotai-ModernBERT-base-ai-detector-ONNX",
    name: "modernbert-ai-detector",
    hot: false,
    weight: 0.65,
    aiLabel: "LABEL_1",
  },
];

export function workerSource(): string {
  return [
    "let pipes=null;",
    "function aiProb(rows){",
    "  if(!Array.isArray(rows)) rows=[rows];",
    "  const hit=rows.find(r=>/chatgpt|^ai|fake|generated|machine|label_1/i.test(r.label));",
    "  return hit?hit.score:0;",
    "}",
    "let chain=Promise.resolve();",
    "self.onmessage=function(e){ chain=chain.then(()=>handle(e.data)).catch(()=>{}); };",
    "async function handle(d){",
    "  try{",
    "    if(d.cmd==='load'){",
    "      const lib=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.0');",
    "      lib.env.allowLocalModels=false;",
    "      try{ lib.env.backends.onnx.wasm.numThreads = Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency||4)/2) - 1)); }catch(_){}",
    "      pipes=[];",
    "      for(let i=0;i<d.ids.length;i++){",
    "        const n=i+1;",
    "        pipes.push(await lib.pipeline('text-classification', d.ids[i], { dtype:'q8',",
    "          progress_callback:(p)=>{",
    "            if(p && p.status==='progress' && p.total){",
    "              const pct=Math.round(p.loaded/p.total*100);",
    "              self.postMessage({type:'status', msg:'Downloading model '+n+' of '+d.ids.length+' — '+pct+'%'});",
    "            } else if(p && p.status==='ready'){",
    "              self.postMessage({type:'status', msg:'Model '+n+' ready'});",
    "            }",
    "          } }));",
    "      }",
    "      self.postMessage({type:'ready', id:d.id});",
    "      return;",
    "    }",
    "    if(d.cmd==='score'){",
    "      const texts=d.texts, B=6, out=[];",
    "      for(let s=0;s<texts.length;s+=B){",
    "        const batch=texts.slice(s,s+B), per=[];",
    "        for(let m=0;m<pipes.length;m++){",
    "          let r=await pipes[m](batch,{top_k:null});",
    "          if(batch.length===1 && !Array.isArray(r[0])) r=[r];",
    "          per.push(r.map(aiProb));",
    "        }",
    "        for(let k=0;k<batch.length;k++) out.push(per.map(a=>a[k]));",
    "        self.postMessage({type:'progress', id:d.id, done:Math.min(texts.length,s+B), total:texts.length});",
    "      }",
    "      self.postMessage({type:'scored', id:d.id, out:out});",
    "      return;",
    "    }",
    "  }catch(err){ self.postMessage({type:'error', id:d.id, err:String(err&&err.message||err).slice(0,240)}); }",
    "}",
  ].join("\n");
}
