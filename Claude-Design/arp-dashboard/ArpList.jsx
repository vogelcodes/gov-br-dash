function ArpList({ atas, selectedIdx, onSelect }) {
  return (
    <aside style={{width:360,flexShrink:0,background:'#FFF',border:'1px solid #E8E8E8',borderRadius:6,overflow:'hidden'}}>
      <div style={{padding:'14px 16px',borderBottom:'1px solid #E8E8E8',background:'#F8F8F8'}}>
        <div style={{fontSize:11,fontWeight:600,color:'#333',textTransform:'uppercase',letterSpacing:'0.05em'}}>Atas de Registro de Preços</div>
        <div style={{fontSize:13,color:'#1a1a1a',marginTop:2}}>{atas.length} de 84 exibidas</div>
      </div>
      <div style={{maxHeight:680,overflowY:'auto'}}>
        {atas.map((ata, i) => {
          const ag = aggregateAta(ata);
          const vigFim = parseBR(ata.vigenciaFinal);
          const diasRest = Math.round((vigFim - TODAY) / (1000*60*60*24));
          const risco = ag.execPct < 60 && diasRest < 180;
          const active = i === selectedIdx;
          return (
            <div key={ata.numero}
                 onClick={() => onSelect(i)}
                 style={{
                   padding:'14px 16px', borderBottom:'1px solid #F0F0F0',
                   cursor:'pointer',
                   background: active ? '#E8F0FE' : 'transparent',
                   borderLeft: active ? '3px solid #1351B4' : '3px solid transparent',
                 }}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:4}}>
                <div style={{fontSize:14,fontWeight:600,color: active ? '#0D47A1' : '#1a1a1a',fontVariantNumeric:'tabular-nums'}}>ARP {ata.numero}</div>
                <span style={{fontSize:10,fontWeight:600,letterSpacing:'0.05em',padding:'2px 8px',borderRadius:9999,
                   background: risco ? '#FDECEA' : '#ECEFF1', color: risco ? '#B00020' : '#37474F'}}>{risco ? 'ATENÇÃO' : 'NO PRAZO'}</span>
              </div>
              <div style={{fontSize:12,color:'#333',marginBottom:8,lineHeight:1.4,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{ata.objeto}</div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#333',fontVariantNumeric:'tabular-nums'}}>
                <span>{fmtBRL(ata.valorTotal)}</span>
                <span>{ata.itens.length} itens · {ag.execPct}% exec.</span>
              </div>
              <div style={{height:4,background:'#F0F0F0',borderRadius:2,marginTop:8,overflow:'hidden'}}>
                <div style={{width:ag.execPct+'%',height:'100%',background: risco ? '#B00020' : '#1351B4'}}/>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
window.ArpList = ArpList;
