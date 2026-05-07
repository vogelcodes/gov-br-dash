function KpiStrip({ data }) {
  const agg = aggregateAll(data.atas);
  const Card = ({ label, value, sub, accent, icon }) => (
    <div style={{
      flex:1, minWidth:200, padding:'20px 22px',
      background:'#FFF', border:'1px solid #E8E8E8', borderRadius:6,
      borderLeft: accent ? `4px solid ${accent}` : '1px solid #E8E8E8',
      display:'flex', flexDirection:'column', gap:6,
    }}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <i className={"fas "+icon} style={{color:accent || '#1351B4',fontSize:12}}></i>
        <div style={{fontSize:11,fontWeight:600,color:'#333',textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</div>
      </div>
      <div style={{fontSize:28,fontWeight:600,lineHeight:1.1,letterSpacing:'-0.01em',fontVariantNumeric:'tabular-nums',color:'#1a1a1a'}}>{value}</div>
      {sub && <div style={{fontSize:12,color:'#333'}}>{sub}</div>}
    </div>
  );
  return (
    <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
      <Card label="ARPs ativas"         value={fmtNum(data.totalARPs)}         sub={"período "+data.periodoBusca}      icon="fa-folder-open" accent="#1351B4"/>
      <Card label="Valor total das ARPs"  value={fmtBRL(agg.valorTotal)}        sub="somatório de todos os itens"       icon="fa-coins"       accent="#071D41"/>
      <Card label="Valor empenhado"     value={fmtBRL(agg.valorEmp)}           sub={`${pct(agg.valorEmp, agg.valorTotal)}% executado`} icon="fa-check-circle" accent="#0D47A1"/>
      <Card label="Itens em risco"      value={fmtNum(agg.itensRisco)}         sub="execução baixa · vigência próxima"  icon="fa-exclamation-triangle" accent="#B00020"/>
    </div>
  );
}
window.KpiStrip = KpiStrip;
