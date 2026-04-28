import { useState, useEffect } from "react";
import { Plus, Trash2, Download, Clock, Euro, FileText, Save, ChevronLeft, ChevronRight, Menu, X, Camera, Copy } from "lucide-react";
import { supabase } from "./supabase";

const USER_ID = "omar"; // identifiant unique pour tes donnees

const getISOWeek = (date) => {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
};

const getWeekDates = (wn, yr) => {
  const jan4 = new Date(yr, 0, 4);
  const s = new Date(jan4);
  s.setDate(jan4.getDate() - (jan4.getDay() + 6) % 7 + (wn - 1) * 7);
  const labels = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
  return Array.from({length:7}, (_, i) => {
    const d = new Date(s);
    d.setDate(s.getDate() + i);
    return {
      jour: labels[i], date: d.getDate(),
      fullDate: String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+String(d.getFullYear()).slice(-2),
      month: d.toLocaleDateString("fr-FR",{month:"short"}), year: d.getFullYear(), dayIndex: i
    };
  });
};

const today = new Date();
const INIT_WEEK = getISOWeek(today);
const INIT_YEAR = today.getFullYear();
const mkEntry = (d) => ({jour:d.jour, date:d.date, fullDate:d.fullDate, dayIndex:d.dayIndex, affaire:"", description:"", voyage:0, surSite:0});
const mkWeek = (wn, yr) => ({ timeEntries: getWeekDates(wn,yr).slice(0,5).map(mkEntry), affaireGroups:[], receipts:[] });
const OBJET_TYPES = ["Hotel","Repas","Carburant","Peage","Parking","Autre"];

export default function App() {
  const [tab, setTab] = useState("temps");
  const [week, setWeek] = useState(INIT_WEEK);
  const [year, setYear] = useState(INIT_YEAR);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportHTML, setReportHTML] = useState("");
  const [showDashboard, setShowDashboard] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [contacts, setContacts] = useState([{nom:"RH", email:"rh@syntegon.com"}]);
  const [newContact, setNewContact] = useState({nom:"", email:""});
  const [saving, setSaving] = useState(false);
  const [allWeeksSummary, setAllWeeksSummary] = useState([]);
  const [emp, setEmp] = useState({nom:"Ben Sekkou", prenom:"Omar", entreprise:"Syntegon Telstar France", matricule:"AB-123-CD"});
  const [weekDates, setWeekDates] = useState(getWeekDates(INIT_WEEK, INIT_YEAR));
  const [data, setData] = useState(mkWeek(INIT_WEEK, INIT_YEAR));
  const [loading, setLoading] = useState(true);

  // Charger la semaine depuis Supabase
  const loadWeek = async (wn, yr) => {
    const id = USER_ID+"-"+yr+"-W"+wn;
    const { data: row } = await supabase.from("weeks").select("data").eq("id", id).single();
    return row ? row.data : null;
  };

  // Charger toutes les semaines pour le dashboard
  const loadAllWeeks = async () => {
    const { data: rows } = await supabase.from("weeks").select("id, data").like("id", USER_ID+"-%").order("id", {ascending:false});
    if (!rows) return;
    const summary = rows.map(row => {
      const wd = row.data;
      const tv = (wd.timeEntries||[]).reduce((s,e)=>s+(parseFloat(e.voyage)||0),0);
      const ts = (wd.timeEntries||[]).reduce((s,e)=>s+(parseFloat(e.surSite)||0),0);
      const euros = (wd.affaireGroups||[]).reduce((s,g)=>s+g.expenses.reduce((ss,e)=>ss+(parseFloat(e.euros)||0),0),0);
      const affaires = [...new Set((wd.timeEntries||[]).map(e=>(e.affaire||"").trim()).filter(Boolean))];
      const parts = row.id.replace(USER_ID+"-","").split("-W");
      return { key:row.id, yr:parseInt(parts[0]), wn:parseInt(parts[1]), tv, ts, tot:tv+ts, euros, affaires };
    }).filter(s => s.tot > 0 || s.euros > 0);
    setAllWeeksSummary(summary);
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const stored = await loadWeek(INIT_WEEK, INIT_YEAR);
      if (stored) setData(stored);
      setLoading(false);
    };
    init();
  }, []);

  const changeWeek = async (nw, ny) => {
    setLoading(true);
    setWeek(nw); setYear(ny);
    setWeekDates(getWeekDates(nw,ny));
    const stored = await loadWeek(nw, ny);
    setData(stored || mkWeek(nw, ny));
    setLoading(false);
  };

  const prevWeek = () => week>1 ? changeWeek(week-1,year) : changeWeek(52,year-1);
  const nextWeek = () => week<52 ? changeWeek(week+1,year) : changeWeek(1,year+1);

const saveWeek = async () => {
  setSaving(true);
  const id = USER_ID + "-" + year + "-W" + week;
  // Nettoyage du JSON avant sauvegarde (évite les timeouts)
if (data.receipts && data.receipts.length > 0) {
  data.receipts = data.receipts.map(r =>
    typeof r === "string" ? r : r.name || r.url
  );
}

  // Sauvegarder les données sans les images (trop lourdes)
  const dataWithoutReceipts = { ...data, receipts: [] };

  // Sauvegarder les factures séparément
  const receiptsId = id + "-receipts";

  const [weekRes, receiptRes] = await Promise.all([
    supabase.from("weeks").upsert({
      id,
      user_id: USER_ID,
      data: dataWithoutReceipts,
      updated_at: new Date().toISOString()
    }),
    supabase.from("weeks").upsert({
      id: receiptsId,
      user_id: USER_ID,
      data: { receipts: data.receipts },
      updated_at: new Date().toISOString()
    })
  ]);

  setSaving(false);

  if (weekRes.error) alert("Erreur sauvegarde : " + weekRes.error.message);
  else if (receiptRes.error) alert("Données sauvegardées mais erreur factures : " + receiptRes.error.message);
  else alert("Semaine S" + week + "/" + year + " sauvegardée !");
  };

  const dupDay = (idx) => {
    const arr = [...data.timeEntries];
    arr.splice(idx+1, 0, {...data.timeEntries[idx], affaire:"", description:"", voyage:0, surSite:0});
    setData({...data, timeEntries:arr});
  };
  const addDay = () => {
    const used = new Set(data.timeEntries.map(e=>e.dayIndex));
    const next = weekDates.slice(0,5).find(d=>!used.has(d.dayIndex)) || weekDates[0];
    setData({...data, timeEntries:[...data.timeEntries, mkEntry(next)]});
  };
  const updEntry = (idx, field, val) => {
    const arr = [...data.timeEntries];
    if (field==="dayIndex") {
      const d = weekDates[parseInt(val)];
      arr[idx] = {...arr[idx], dayIndex:parseInt(val), jour:d.jour, date:d.date, fullDate:d.fullDate};
    } else arr[idx] = {...arr[idx], [field]:val};
    setData({...data, timeEntries:arr});
  };
  const delEntry = (idx) => setData({...data, timeEntries:data.timeEntries.filter((_,i)=>i!==idx)});

  const grpTotal = (g) => g.expenses.reduce((s,e)=>s+(parseFloat(e.euros)||0),0);
  const getTotals = () => {
    const tv = data.timeEntries.reduce((s,e)=>s+(parseFloat(e.voyage)||0),0);
    const ts = data.timeEntries.reduce((s,e)=>s+(parseFloat(e.surSite)||0),0);
    return {tv, ts, tot:tv+ts};
  };
  const getExpTotal = () => data.affaireGroups.reduce((s,g)=>s+grpTotal(g),0);

  const addGroup = () => setData({...data, affaireGroups:[...data.affaireGroups, {
    numDeplacement:"", typeAppareil:"", client:"", villePays:"",
    expenses: weekDates.map(d=>({date:d.fullDate, objet:"", description:"", euros:""}))
  }]});
  const updGroup = (gi,f,v) => { const arr=[...data.affaireGroups]; arr[gi]={...arr[gi],[f]:v}; setData({...data,affaireGroups:arr}); };
  const delGroup = (gi) => setData({...data, affaireGroups:data.affaireGroups.filter((_,i)=>i!==gi)});
  const updExp = (gi,ei,f,v) => { const arr=JSON.parse(JSON.stringify(data.affaireGroups)); arr[gi].expenses[ei][f]=v; setData({...data,affaireGroups:arr}); };
  const addExp = (gi) => { const arr=[...data.affaireGroups]; arr[gi].expenses.push({date:weekDates[arr[gi].expenses.length%7].fullDate, objet:"", description:"", euros:""}); setData({...data,affaireGroups:arr}); };
  const delExp = (gi,ei) => { const arr=[...data.affaireGroups]; arr[gi].expenses=arr[gi].expenses.filter((_,i)=>i!==ei); setData({...data,affaireGroups:arr}); };

  // Utilitaire de compression image
const compressImage = (file, maxWidth = 1200, quality = 0.7) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (!file.type.startsWith("image/")) {
        // Pour les PDF, pas de compression possible, on garde tel quel
        resolve(ev.target.result);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
};

const addFile = async (e) => {
  for (const f of e.target.files) {
    const dataUrl = await compressImage(f);
    const fileName = `${USER_ID}/${Date.now()}-${f.name}`;

    // Upload dans Supabase Storage
    const { error } = await supabase.storage
      .from("receipts")
      .upload(fileName, dataUrl.split(",")[1], {
        contentType: "image/jpeg",
        upsert: true
      });

    if (error) {
      alert("Erreur upload : " + error.message);
      return;
    }

    setData(p => ({
      ...p,
      receipts: [...p.receipts, {
        name: f.name,
        url: fileName,
        date: new Date().toLocaleDateString("fr-FR")
      }]
    }));
  }
};

};

const addPhoto = async (e) => {
  for (const f of e.target.files) {
    const dataUrl = await compressImage(f);
    const fileName = `${USER_ID}/${Date.now()}-photo.jpg`;

    const { error } = await supabase.storage
      .from("receipts")
      .upload(fileName, dataUrl.split(",")[1], {
        contentType: "image/jpeg",
        upsert: true
      });

    if (error) {
      alert("Erreur upload : " + error.message);
      return;
    }

    setData(p => ({
      ...p,
      receipts: [...p.receipts, {
        name: fileName,
        url: fileName,
        date: new Date().toLocaleDateString("fr-FR")
      }]
    }));
  }
};

};

  const sendByEmail = (contact) => {
    const t = getTotals();
    const subject = "Rapport Semaine S"+week+" "+year+" - "+emp.prenom+" "+emp.nom;
    const body = ["Bonjour,","","Veuillez trouver mon rapport de la semaine S"+week+"/"+year+".","","RESUME :","- Heures voyage : "+t.tv.toFixed(2)+"h","- Heures sur site : "+t.ts.toFixed(2)+"h","- Total heures : "+t.tot.toFixed(2)+"h","- Frais a rembourser : "+getExpTotal().toFixed(2)+" EUR","","Cordialement,",emp.prenom+" "+emp.nom,emp.entreprise].join("\n");
    window.location.href = "mailto:"+contact.email+"?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(body);
    setShowSendModal(false);
  };

  const genReport = () => {
    const t = getTotals();
    const et = getExpTotal();
    const byAff = {};
    data.timeEntries.forEach(e => {
      const k = (e.affaire||"").trim(); if (!k) return;
      if (!byAff[k]) byAff[k] = {v:0,s:0};
      byAff[k].v += parseFloat(e.voyage)||0; byAff[k].s += parseFloat(e.surSite)||0;
    });
    const affKeys = Object.keys(byAff);
    const periode = weekDates[0].date+" "+weekDates[0].month+" "+weekDates[0].year+" - "+weekDates[6].date+" "+weekDates[6].month+" "+weekDates[6].year;
    const genDate = new Date().toLocaleDateString("fr-FR")+" a "+new Date().toLocaleTimeString("fr-FR");
    let h = "";
    h += "<!DOCTYPE html><html><head><meta charset=UTF-8><title>Rapport S"+week+" "+year+"</title>";
    h += "<style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;padding:20px;font-size:12px;color:#111}h2{background:#EEF2FF;padding:8px;font-size:13px;margin:18px 0 8px}table{width:100%;border-collapse:collapse;margin-bottom:10px}th{background:#4F46E5;color:#fff;padding:7px;text-align:left;font-size:11px}td{padding:6px;border-bottom:1px solid #ddd;font-size:11px}.hdr{background:#1E3A8A;color:#fff;padding:14px;text-align:center;margin:-20px -20px 18px}.hdr h1{margin:0;font-size:19px}.hdr p{margin:5px 0 0;font-size:12px}.tr{background:#DBEAFE;font-weight:bold}.gt{background:#10B981;color:#fff;font-weight:bold}.sig{margin:25px 0;padding:18px;border:2px solid #ccc;border-radius:6px}.sl{border-bottom:2px solid #000;margin:28px 0 8px}.aff{background:#F3F4F6;padding:10px;border-radius:6px;margin-bottom:12px}.btn{display:block;width:100%;padding:14px;background:#10B981;color:#fff;font-size:16px;font-weight:bold;border:none;border-radius:8px;cursor:pointer;margin-bottom:8px}@media print{.noprint{display:none}}</style></head><body>";
    h += "<div class=noprint style='background:#FFF9C4;padding:16px;margin:-20px -20px 18px;text-align:center'><button class=btn onclick='window.print()'>Imprimer / Enregistrer en PDF</button><p style='color:#7C4700;font-size:12px;margin:0'>Choisir <b>Enregistrer en PDF</b> comme imprimante</p></div>";
    h += "<div class=hdr><h1>"+emp.entreprise+"</h1><p>"+emp.prenom+" "+emp.nom+"</p>"+(emp.matricule?"<p>Vehicule : "+emp.matricule+"</p>":"")+"</div>";
    h += "<h2>Rapport Semaine "+week+" - "+year+"</h2><p><b>Periode :</b> "+periode+"</p><p><b>Genere le :</b> "+genDate+"</p>";
    h += "<h2>Fiche de Temps</h2><table><thead><tr><th>Jour</th><th>Affaire</th><th style='text-align:right'>Voyage h</th><th style='text-align:right'>Sur site h</th></tr></thead><tbody>";
    data.timeEntries.forEach(e => { h += "<tr><td>"+e.jour+" "+e.date+"</td><td>"+(e.affaire||"-")+(e.description?" - "+e.description:"")+"</td><td style='text-align:right'>"+parseFloat(e.voyage||0).toFixed(1)+"</td><td style='text-align:right'>"+parseFloat(e.surSite||0).toFixed(1)+"</td></tr>"; });
    h += "<tr class=tr><td colspan=2 style='text-align:right'>TOTAL</td><td style='text-align:right'>"+t.tv.toFixed(2)+"</td><td style='text-align:right'>"+t.ts.toFixed(2)+"</td></tr>";
    h += "<tr class=tr><td colspan=3 style='text-align:right'>TOTAL GENERAL</td><td style='text-align:right'><b>"+t.tot.toFixed(2)+" h</b></td></tr></tbody></table>";
    if(affKeys.length>0){
      h += "<h2>Recap par Affaire</h2><table><thead><tr><th>Affaire</th><th style='text-align:right'>Voyage h</th><th style='text-align:right'>Sur site h</th><th style='text-align:right'>Total h</th></tr></thead><tbody>";
      affKeys.forEach(k=>{ h += "<tr><td style='font-weight:bold;color:#4338CA'>"+k+"</td><td style='text-align:right'>"+byAff[k].v.toFixed(2)+"</td><td style='text-align:right'>"+byAff[k].s.toFixed(2)+"</td><td style='text-align:right;font-weight:bold'>"+(byAff[k].v+byAff[k].s).toFixed(2)+"</td></tr>"; });
      h += "</tbody></table>";
    }
    if(data.affaireGroups.length>0){
      h += "<h2>Notes de Frais</h2>";
      data.affaireGroups.forEach(g=>{ h += "<div class=aff><table style='border:1px solid #ccc;font-size:10px;margin-bottom:8px'>"; [["N DEPLACEMENT",g.numDeplacement],["TYPE APPAREIL",g.typeAppareil],["CLIENT",g.client],["VILLE/PAYS",g.villePays]].forEach(([l,v])=>{ h += "<tr><td style='font-weight:bold;border:1px solid #ccc;padding:4px;width:40%'>"+l+"</td><td style='border:1px solid #ccc;padding:4px'>"+(v||"-")+"</td></tr>"; }); h += "</table><table><thead><tr><th>Date</th><th>Objet</th><th style='text-align:right'>EUR</th></tr></thead><tbody>"; g.expenses.forEach(ex=>{ h += "<tr><td>"+ex.date+"</td><td>"+(ex.objet||"-")+(ex.description?" - "+ex.description:"")+"</td><td style='text-align:right'>"+parseFloat(ex.euros||0).toFixed(2)+"</td></tr>"; }); h += "<tr class=tr><td colspan=2 style='text-align:right'>TOTAL AFFAIRE</td><td style='text-align:right'>"+grpTotal(g).toFixed(2)+" EUR</td></tr></tbody></table></div>"; });
      h += "<table><tr class=gt><td colspan=2 style='padding:10px;text-align:right'>TOTAL A REMBOURSER</td><td style='padding:10px;text-align:right'>"+et.toFixed(2)+" EUR</td></tr></table>";
    }
    if(data.receipts.length>0){ h += "<h2>Factures</h2>"; data.receipts.forEach((r,i)=>{ h += "<div style='margin:12px 0;padding:10px;background:#F9FAFB;border-radius:5px'><p style='font-weight:bold;margin:0 0 6px'>"+(i+1)+". "+r.name+"</p><p style='font-size:10px;color:#666;margin:0 0 6px'>"+r.size+" | "+r.date+"</p>"; if(r.type.startsWith("image/")) h += "<img src='"+r.dataUrl+"' style='max-width:100%;border:1px solid #ddd;border-radius:4px'>"; h += "</div>"; }); }
    h += "<div class=sig><p style='font-weight:bold;text-align:center;margin:0 0 8px'>Signature employe</p><div class=sl></div><p style='text-align:center'><b>"+emp.prenom+" "+emp.nom+"</b></p></div>";
    h += "<div class=sig><p style='font-weight:bold;text-align:center;margin:0 0 8px'>Signature responsable</p><div class=sl></div><p style='text-align:center'>_______________________</p></div>";
    h += "<p style='text-align:center;color:#999;font-size:10px;margin-top:20px;border-top:1px solid #ddd;padding-top:16px'>Gestion Itinerant | "+emp.entreprise+"</p></body></html>";
    setReportHTML(h);
    setShowReport(true);
  };

  const t = getTotals();
  const grouped = data.timeEntries.reduce((acc,e,idx)=>{ if(!acc[e.dayIndex]) acc[e.dayIndex]=[]; acc[e.dayIndex].push({...e,_idx:idx}); return acc; },{});
  const affEntries = Object.entries((() => { const b={}; data.timeEntries.forEach(e=>{ const k=(e.affaire||"").trim(); if(!k) return; if(!b[k]) b[k]={v:0,s:0}; b[k].v+=parseFloat(e.voyage)||0; b[k].s+=parseFloat(e.surSite)||0; }); return b; })());

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 pb-24">
      <div className="bg-indigo-600 text-white p-4 sticky top-0 z-50 shadow-lg">
        <div className="flex items-center justify-between">
          <div><h1 className="text-xl font-bold">Gestion Itinerant</h1><p className="text-xs opacity-90">{emp.prenom} {emp.nom}</p></div>
          <div className="flex gap-2">
            <button onClick={()=>setShowSendModal(true)} className="p-2 bg-indigo-500 rounded-lg"><Download className="w-5 h-5 rotate-180"/></button>
            <button onClick={()=>{ loadAllWeeks(); setShowDashboard(true); }} className="p-2 bg-indigo-500 rounded-lg"><FileText className="w-5 h-5"/></button>
            <button onClick={()=>setMenuOpen(!menuOpen)} className="p-2">{menuOpen?<X className="w-6 h-6"/>:<Menu className="w-6 h-6"/>}</button>
          </div>
        </div>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={()=>setMenuOpen(false)}>
          <div className="absolute right-0 top-0 h-full w-64 bg-white shadow-xl p-4" onClick={e=>e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6"><h3 className="font-bold text-lg">Parametres</h3><button onClick={()=>setMenuOpen(false)}><X className="w-5 h-5"/></button></div>
            <div className="space-y-3">
              {[["Prenom","prenom"],["Nom","nom"],["Entreprise","entreprise"],["Matricule","matricule"]].map(([label,field])=>(
                <div key={field}><label className="block text-xs font-bold mb-1">{label}</label><input type="text" value={emp[field]} onChange={e=>setEmp({...emp,[field]:e.target.value})} className="w-full px-3 py-2 border rounded text-sm"/></div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white shadow-md p-3 sticky top-16 z-30">
        <div className="flex items-center justify-between">
          <button onClick={prevWeek} className="p-2 rounded-lg bg-indigo-100"><ChevronLeft className="w-5 h-5 text-indigo-600"/></button>
          <div className="text-center">
            <div className="text-lg font-bold text-indigo-600">S{week} - {year}{week===INIT_WEEK&&year===INIT_YEAR&&<span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Actuelle</span>}</div>
            <div className="text-xs text-gray-600">{weekDates[0].date} {weekDates[0].month} — {weekDates[6].date} {weekDates[6].month}</div>
          </div>
          <button onClick={nextWeek} className="p-2 rounded-lg bg-indigo-100"><ChevronRight className="w-5 h-5 text-indigo-600"/></button>
        </div>
      </div>

      <div className="bg-white border-b sticky top-28 z-20 flex">
        {[["temps","Temps",<Clock className="inline w-4 h-4 mr-1"/>],["frais","Frais",<Euro className="inline w-4 h-4 mr-1"/>],["factures","Factures ("+data.receipts.length+")",<FileText className="inline w-4 h-4 mr-1"/>]].map(([id,label,icon])=>(
          <button key={id} onClick={()=>setTab(id)} className={"flex-1 px-2 py-3 font-medium text-sm "+(tab===id?"border-b-2 border-indigo-600 text-indigo-600 bg-indigo-50":"text-gray-600")}>{icon}{label}</button>
        ))}
      </div>

      {loading && <div className="flex items-center justify-center py-20"><div className="text-indigo-600 font-medium">Chargement...</div></div>}

      {!loading && <div className="p-4">
        {tab==="temps" && (
          <div className="space-y-3">
            {Object.entries(grouped).sort((a,b)=>a[0]-b[0]).map(([di,entries])=>(
              <div key={di} className="bg-white rounded-xl shadow">
                <div className="bg-indigo-600 text-white px-4 py-2 rounded-t-xl flex justify-between items-center">
                  <span className="font-bold">{entries[0].jour} {entries[0].date}</span>
                  {entries.length>1&&<span className="text-xs opacity-75">{entries.length} affaires</span>}
                </div>
                {entries.map((e,si)=>(
                  <div key={si} className={"p-3 "+(si<entries.length-1?"border-b border-dashed border-indigo-200":"")}>
                    <div className="flex items-center justify-between mb-2">
                      {entries.length>1&&<span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-medium">Affaire {si+1}</span>}
                      <button onClick={()=>delEntry(e._idx)} className="text-red-500 ml-auto"><Trash2 className="w-4 h-4"/></button>
                    </div>
                    <select value={e.dayIndex} onChange={ev=>updEntry(e._idx,"dayIndex",ev.target.value)} className="w-full px-3 py-2 border rounded mb-2 text-sm bg-gray-50">
                      {weekDates.map(d=><option key={d.dayIndex} value={d.dayIndex}>{d.jour} {d.date} {d.month}</option>)}
                    </select>
                    <input type="text" value={e.affaire} onChange={ev=>updEntry(e._idx,"affaire",ev.target.value)} placeholder="N Affaire" className="w-full px-3 py-2 border rounded mb-2 text-sm"/>
                    <input type="text" value={e.description} onChange={ev=>updEntry(e._idx,"description",ev.target.value)} placeholder="Description" className="w-full px-3 py-2 border rounded mb-2 text-sm"/>
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="text-xs text-gray-500 block mb-1">Voyage (h)</label><input type="text" inputMode="decimal" value={e.voyage} onChange={ev=>{if(/^\d*\.?\d*$/.test(ev.target.value)) updEntry(e._idx,"voyage",ev.target.value);}} className="w-full px-3 py-2 border rounded text-sm"/></div>
                      <div><label className="text-xs text-gray-500 block mb-1">Sur site (h)</label><input type="text" inputMode="decimal" value={e.surSite} onChange={ev=>{if(/^\d*\.?\d*$/.test(ev.target.value)) updEntry(e._idx,"surSite",ev.target.value);}} className="w-full px-3 py-2 border rounded text-sm"/></div>
                    </div>
                  </div>
                ))}
                <div className="px-3 pb-3"><button onClick={()=>dupDay(entries[entries.length-1]._idx)} className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-indigo-300 text-indigo-600 py-2 rounded-lg text-sm font-medium"><Copy className="w-4 h-4"/>Ajouter une 2e affaire ce jour</button></div>
              </div>
            ))}
            <button onClick={addDay} className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-lg font-medium shadow-lg"><Plus className="w-5 h-5"/>Ajouter un jour</button>
            <div className="bg-blue-100 rounded-lg p-4">
              <div className="text-sm font-bold mb-3 text-blue-800">Recap semaine</div>
              <div className="grid grid-cols-2 gap-2 text-sm mb-2"><div>Voyage : <strong>{t.tv.toFixed(2)}h</strong></div><div>Sur site : <strong>{t.ts.toFixed(2)}h</strong></div></div>
              <div className="text-center text-xl font-bold text-blue-700 mb-3">Total : {t.tot.toFixed(2)}h</div>
              {affEntries.length>0&&(<><div className="border-t border-blue-300 mb-3"/><div className="text-xs font-bold text-blue-700 mb-2 uppercase">Par affaire</div><div className="space-y-2">{affEntries.map(([k,h])=>(<div key={k} className="bg-white rounded-lg px-3 py-2"><div className="text-xs font-bold text-indigo-700 mb-1">{k}</div><div className="grid grid-cols-3 gap-1 text-xs text-gray-600"><div>Voyage<br/><strong>{h.v.toFixed(2)}h</strong></div><div>Sur site<br/><strong>{h.s.toFixed(2)}h</strong></div><div>Total<br/><strong className="text-blue-700">{(h.v+h.s).toFixed(2)}h</strong></div></div></div>))}</div></>)}
            </div>
          </div>
        )}

        {tab==="frais" && (
          <div className="space-y-4">
            {data.affaireGroups.length===0?(<div className="text-center py-12 bg-white rounded-lg shadow"><Euro className="w-16 h-16 mx-auto mb-4 text-indigo-300"/><p className="font-bold text-gray-600 mb-4">Aucune note de frais</p><button onClick={addGroup} className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium mx-auto"><Plus className="w-5 h-5"/>Ajouter une affaire</button></div>):(
              data.affaireGroups.map((g,gi)=>(
                <div key={gi} className="bg-white rounded-lg shadow-lg p-4">
                  <div className="flex justify-between items-center mb-3 pb-3 border-b"><div><h3 className="font-bold text-indigo-700">Affaire #{gi+1}</h3><p className="text-xs text-gray-500">{g.numDeplacement||"A completer"}</p></div><button onClick={()=>delGroup(gi)} className="text-red-600"><Trash2 className="w-5 h-5"/></button></div>
                  <div className="space-y-2 mb-3">{[["numDeplacement","N Deplacement"],["typeAppareil","Type Appareil"],["client","Client"],["villePays","Ville/Pays"]].map(([f,ph])=>(<input key={f} type="text" value={g[f]||""} onChange={e=>updGroup(gi,f,e.target.value)} placeholder={ph} className="w-full px-3 py-2 border rounded text-sm"/>))}</div>
                  <div className="space-y-2">{g.expenses.map((ex,ei)=>(<div key={ei} className="bg-gray-50 rounded p-3 border"><div className="flex justify-between mb-2"><span className="text-xs font-bold text-gray-500">{ex.date}</span><button onClick={()=>delExp(gi,ei)} className="text-red-500"><Trash2 className="w-4 h-4"/></button></div><select value={ex.objet} onChange={ev=>updExp(gi,ei,"objet",ev.target.value)} className="w-full px-3 py-2 border rounded mb-2 text-sm"><option value="">-- Type --</option>{OBJET_TYPES.map(o=><option key={o}>{o}</option>)}</select><input type="text" value={ex.description} onChange={ev=>updExp(gi,ei,"description",ev.target.value)} placeholder="Description" className="w-full px-3 py-2 border rounded mb-2 text-sm"/><input type="text" inputMode="decimal" value={ex.euros} onChange={ev=>{if(/^\d*\.?\d*$/.test(ev.target.value)) updExp(gi,ei,"euros",ev.target.value);}} placeholder="Montant EUR" className="w-full px-3 py-2 border rounded text-sm"/></div>))}</div>
                  <div className="mt-3 flex justify-between items-center bg-blue-50 p-3 rounded"><button onClick={()=>addExp(gi)} className="flex items-center gap-2 bg-indigo-600 text-white px-3 py-2 rounded text-sm"><Plus className="w-4 h-4"/>Ligne</button><div className="font-bold text-lg">{grpTotal(g).toFixed(2)} EUR</div></div>
                </div>
              ))
            )}
            {data.affaireGroups.length>0&&<button onClick={addGroup} className="w-full flex items-center justify-center gap-2 bg-green-600 text-white py-3 rounded-lg font-medium shadow-lg"><Plus className="w-5 h-5"/>Nouvelle affaire</button>}
            <div className="bg-green-100 rounded-lg p-4"><div className="text-center text-xl font-bold text-green-700">Total : {getExpTotal().toFixed(2)} EUR</div></div>
          </div>
        )}

        {tab==="factures" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <label className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-lg cursor-pointer"><FileText className="w-5 h-5"/>Fichiers<input type="file" multiple accept="image/*,application/pdf" onChange={addFile} className="hidden"/></label>
              <label className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white py-3 rounded-lg cursor-pointer"><Camera className="w-5 h-5"/>Photo<input type="file" accept="image/*" capture="environment" onChange={addPhoto} className="hidden"/></label>
            </div>
            {data.receipts.length===0?(<div className="text-center py-12 bg-white rounded-lg shadow"><FileText className="w-16 h-16 mx-auto mb-4 text-indigo-300"/><p className="font-bold text-gray-600">Aucune facture</p></div>):(
              <div className="space-y-3">{data.receipts.map((r,i)=>(<div key={i} className="bg-white rounded-lg shadow p-3"><div className="flex justify-between mb-2"><div><div className="font-bold text-sm">{r.name}</div><div className="text-xs text-gray-500">{r.size} | {r.date}</div></div><button onClick={()=>setData({...data,receipts:data.receipts.filter((_,j)=>j!==i)})} className="text-red-600"><Trash2 className="w-5 h-5"/></button></div>{r.type.startsWith("image/")&&<img src={r.dataUrl} className="w-full rounded border"/>}</div>))}</div>
            )}
          </div>
        )}
      </div>}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-3 flex gap-2 shadow-lg">
        <button onClick={saveWeek} disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white py-3 rounded-lg font-bold disabled:opacity-60">
          <Save className="w-5 h-5"/>{saving?"Sauvegarde...":"Sauvegarder"}
        </button>
        <button onClick={genReport} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-lg font-bold">
          <Download className="w-5 h-5"/>Voir rapport
        </button>
      </div>

      {showSendModal && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-end">
          <div className="bg-white w-full rounded-t-2xl p-5 max-h-screen overflow-auto">
            <div className="flex items-center justify-between mb-4"><h2 className="font-bold text-lg">Envoyer S{week}/{year}</h2><button onClick={()=>setShowSendModal(false)}><X className="w-6 h-6"/></button></div>
            <div className="space-y-2 mb-5">
              {contacts.length===0&&<p className="text-gray-400 text-sm text-center py-4">Aucun contact</p>}
              {contacts.map((c,i)=>(<div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-3"><div className="flex-1"><div className="font-bold text-sm">{c.nom}</div><div className="text-xs text-gray-500">{c.email}</div></div><button onClick={()=>sendByEmail(c)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold">Envoyer</button><button onClick={()=>setContacts(contacts.filter((_,j)=>j!==i))} className="text-red-400"><Trash2 className="w-4 h-4"/></button></div>))}
            </div>
            <div className="border-t pt-4">
              <div className="text-xs font-bold text-gray-500 mb-2 uppercase">Ajouter un contact</div>
              <div className="flex gap-2 mb-2">
                <input type="text" value={newContact.nom} onChange={e=>setNewContact({...newContact,nom:e.target.value})} placeholder="Nom" className="flex-1 px-3 py-2 border rounded-lg text-sm"/>
                <input type="email" value={newContact.email} onChange={e=>setNewContact({...newContact,email:e.target.value})} placeholder="Email" className="flex-1 px-3 py-2 border rounded-lg text-sm"/>
              </div>
              <button onClick={()=>{ if(newContact.nom&&newContact.email){ setContacts([...contacts,newContact]); setNewContact({nom:"",email:""}); }}} className="w-full flex items-center justify-center gap-2 bg-green-600 text-white py-2 rounded-lg text-sm font-bold"><Plus className="w-4 h-4"/>Ajouter</button>
            </div>
          </div>
        </div>
      )}

      {showDashboard && (
        <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
          <div className="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between">
            <span className="font-bold text-lg">Resume general</span>
            <button onClick={()=>setShowDashboard(false)}><X className="w-6 h-6"/></button>
          </div>
          <div className="grid grid-cols-2 gap-3 p-4">
            <div className="bg-indigo-600 text-white rounded-xl p-4 text-center">
              <div className="text-xs opacity-80 mb-1">Total heures</div>
              <div className="text-2xl font-bold">{allWeeksSummary.reduce((s,w)=>s+w.tot,0).toFixed(1)}h</div>
              <div className="text-xs opacity-70">{allWeeksSummary.length} semaine{allWeeksSummary.length>1?"s":""}</div>
            </div>
            <div className="bg-green-600 text-white rounded-xl p-4 text-center">
              <div className="text-xs opacity-80 mb-1">Total frais</div>
              <div className="text-2xl font-bold">{allWeeksSummary.reduce((s,w)=>s+w.euros,0).toFixed(0)} EUR</div>
            </div>
          </div>
          <div className="flex-1 overflow-auto px-4 pb-6">
            {allWeeksSummary.length===0?(<div className="text-center py-16 text-gray-400"><Clock className="w-16 h-16 mx-auto mb-4 opacity-30"/><p className="font-bold">Aucune donnee sauvegardee</p></div>):(
              <div className="space-y-3">{allWeeksSummary.map(s=>(<div key={s.key} className="bg-white rounded-xl shadow p-4"><div className="flex items-center justify-between mb-3"><div><span className="font-bold text-indigo-700">S{s.wn} - {s.yr}</span>{s.key===USER_ID+"-"+year+"-W"+week&&<span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Actuelle</span>}</div><button onClick={()=>{ setShowDashboard(false); changeWeek(s.wn,s.yr); }} className="text-xs bg-indigo-100 text-indigo-600 px-3 py-1 rounded-full font-medium">Ouvrir</button></div><div className="grid grid-cols-3 gap-2 mb-3"><div className="bg-blue-50 rounded-lg p-2 text-center"><div className="text-xs text-gray-500">Voyage</div><div className="font-bold text-blue-700">{s.tv.toFixed(1)}h</div></div><div className="bg-indigo-50 rounded-lg p-2 text-center"><div className="text-xs text-gray-500">Sur site</div><div className="font-bold text-indigo-700">{s.ts.toFixed(1)}h</div></div><div className="bg-purple-50 rounded-lg p-2 text-center"><div className="text-xs text-gray-500">Total</div><div className="font-bold text-purple-700">{s.tot.toFixed(1)}h</div></div></div>{s.euros>0&&<div className="bg-green-50 rounded-lg px-3 py-2 flex justify-between items-center mb-2"><span className="text-xs text-gray-500">Frais</span><span className="font-bold text-green-700">{s.euros.toFixed(2)} EUR</span></div>}{s.affaires.length>0&&<div className="flex flex-wrap gap-1">{s.affaires.map(a=>(<span key={a} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{a}</span>))}</div>}</div>))}</div>
            )}
          </div>
        </div>
      )}

      {showReport && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="flex items-center justify-between bg-indigo-600 text-white px-4 py-3">
            <span className="font-bold">Rapport S{week}/{year}</span>
            <button onClick={()=>setShowReport(false)}><X className="w-6 h-6"/></button>
          </div>
          <iframe srcDoc={reportHTML} className="flex-1 w-full border-0" title="Rapport"/>
        </div>
      )}
    </div>
  );
}
