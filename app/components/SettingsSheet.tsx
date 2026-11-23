import { useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import { copy, type Language } from "./portfolio-ui";
import { RestoreBackupControl } from "./RestoreBackupControl";

type BackupOperation="idle"|"exporting";

export function DataSettingsSheetV2({t,lang,setLang,rateMode,restoreAutomaticRate,restored,close}:{t:typeof copy.en;lang:Language;setLang:(l:Language)=>void;rateMode:"automatic"|"manual";restoreAutomaticRate:()=>Promise<void>;restored:()=>Promise<void>;close:()=>void}){
  const he=lang==="he";
  const [operation,setOperation]=useState<BackupOperation>("idle");
  const [message,setMessage]=useState<{kind:"success"|"error";text:string}|null>(null);
  const [restoreBusy,setRestoreBusy]=useState(false);
  const busy=operation!=="idle"||restoreBusy;

  const exportBackup=async()=>{
    setOperation("exporting");setMessage(null);
    try{
      const response=await fetch("/api/portfolio",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"export_backup"})});
      if(!response.ok)throw new Error();
      const backup=await response.json();
      const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
      const href=URL.createObjectURL(blob);
      const link=document.createElement("a");
      link.href=href;link.download=`my-wealth-backup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(href),1000);
      setMessage({kind:"success",text:he?"הגיבוי מוכן וההורדה התחילה":"Backup ready—download started"});
    }catch{
      setMessage({kind:"error",text:he?"לא הצלחנו ליצור את הגיבוי. הנתונים שלך לא השתנו.":"Could not create the backup. Your data was not changed."});
    }finally{setOperation("idle")}
  };

  return <div className="modal-backdrop" onClick={busy?undefined:close}>
    <section className="choice-sheet settings-sheet" onClick={(e)=>e.stopPropagation()} aria-busy={busy}>
      <div className="sheet-handle"/>
      <header><div><span>{t.app}</span><h2>{he?"הגדרות":"Settings"}</h2></div><button disabled={busy} onClick={close} aria-label={t.cancel}><X size={20}/></button></header>
      <div className="setting-row"><div><strong>{he?"שפה":"Language"}</strong><small>{he?"שפת הממשק וכיוון התצוגה":"Interface language and direction"}</small></div><div className="language-toggle"><button aria-pressed={lang==="he"} className={lang==="he"?"active":""} onClick={()=>setLang("he")}>עברית</button><button aria-pressed={lang==="en"} className={lang==="en"?"active":""} onClick={()=>setLang("en")}>English</button></div></div>
      <div className="setting-row"><div><strong>{he?"שער דולר–שקל":"USD–ILS rate"}</strong><small>{rateMode==="automatic"?(he?"מתעדכן אוטומטית ברענון השווי":"Updates automatically with valuation refresh"):(he?"כרגע נעשה שימוש בשער ידני":"A manual override is currently active")}</small></div>{rateMode==="manual"&&<button className="secondary" disabled={busy} onClick={()=>void restoreAutomaticRate()}>{he?"חזרה לאוטומטי":"Use automatic"}</button>}</div>
      <div className="setting-row backup-setting">
        <div><strong>{he?"גיבוי ושחזור":"Backup and restore"}</strong><small>{he?"עותק מלא של החשבונות, הנכסים, ההיסטוריה וההגדרות":"A complete copy of accounts, assets, history and settings"}</small></div>
        <div className="backup-actions">
          <button className="secondary" disabled={busy} onClick={()=>void exportBackup()}>{operation==="exporting"?<RefreshCw className="spin" size={16}/>:<Download size={16}/>}<span>{operation==="exporting"?(he?"מכין גיבוי…":"Preparing backup…"):(he?"הורדת גיבוי":"Download backup")}</span></button>
          <RestoreBackupControl he={he} cancelLabel={t.cancel} replaceExisting restored={restored} disabled={operation!=="idle"} onBusyChange={setRestoreBusy}/>
        </div>
        {message&&<small className={`backup-message ${message.kind}`} role="status" aria-live="polite">{message.text}</small>}
      </div>
    </section>
  </div>
}
