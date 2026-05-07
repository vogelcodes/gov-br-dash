function VigenciaTimeline({ ata }) {
  const ini = parseBR(ata.vigenciaInicial);
  const fim = parseBR(ata.vigenciaFinal);
  const total = fim - ini;
  const elapsed = Math.max(0, Math.min(total, TODAY - ini));
  const pctNow = (elapsed / total) * 100;
  const future = TODAY < ini;
  const past   = TODAY > fim;
  return (
    <div style={{background:'#FAFAFA',borderRadius:6,padding:'18px 20px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:10}}>
        <div style={{fontSize:11,fontWeight:600,color:'#333',textTransform:'uppercase',letterSpacing:'0.05em'}}>Vigência da ata</div>
        <div style={{fontSize:12,color:'#333',fontVariantNumeric:'tabular-nums'}}>
          {ata.vigenciaInicial} → {ata.vigenciaFinal}
        </div>
      </div>
      <div style={{position:'relative',height:8,background:'#E8E8E8',borderRadius:4,overflow:'visible'}}>
        <div style={{width:pctNow+'%',height:'100%',background:'#1351B4',borderRadius:4}}/>
        {!future && !past && (
          <div style={{position:'absolute',left:`calc(${pctNow}% - 1px)`,top:-6,width:2,height:20,background:'#B00020'}}/>
        )}
      </div>
      <div style={{display:'flex',justifyContent:'space-between',marginTop:6,fontSize:11,color:'#666',fontVariantNumeric:'tabular-nums'}}>
        <span>início</span>
        {!future && !past && <span style={{color:'#B00020',fontWeight:600}}>hoje · 22/04/2026</span>}
        <span>término</span>
      </div>
    </div>
  );
}
window.VigenciaTimeline = VigenciaTimeline;
