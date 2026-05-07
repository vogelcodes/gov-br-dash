function AtaDetail({ ata }) {
  const [expanded, setExpanded] = React.useState({ 0: true });
  const ag = aggregateAta(ata);

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',gap:16,minWidth:0}}>
      <div style={{background:'#FFF',border:'1px solid #E8E8E8',borderRadius:6,padding:'22px 24px'}}>
        <div style={{display:'flex',alignItems:'baseline',gap:14,marginBottom:6}}>
          <h2 style={{fontSize:28,fontWeight:500,letterSpacing:'-0.01em',margin:0}}>
            ARP <span style={{fontVariantNumeric:'tabular-nums'}}>{ata.numero}</span>
          </h2>
          <span style={{padding:'4px 12px',borderRadius:9999,background:'#E8F0FE',color:'#0D47A1',fontSize:11,fontWeight:600,letterSpacing:'0.05em'}}>{ata.modalidade.toUpperCase()}</span>
          <span style={{padding:'4px 12px',borderRadius:9999,background:'#071D41',color:'#FFF',fontSize:11,fontWeight:600,letterSpacing:'0.05em'}}>{ata.orgao}</span>
        </div>
        <p style={{fontSize:14,color:'#333',lineHeight:1.5,margin:'0 0 18px 0',maxWidth:900}}>{ata.objeto}</p>

        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:18}}>
          <Metric label="Valor total"     value={fmtBRL(ata.valorTotal)} big/>
          <Metric label="Valor empenhado" value={fmtBRL(ag.valorEmp)}    sub={`${pct(ag.valorEmp, ata.valorTotal)}% de execução financeira`}/>
          <Metric label="Saldo disponível" value={fmtBRL(ag.valorSaldo)}  sub="pode ser empenhado até o fim da vigência"/>
          <Metric label="Itens na ata"    value={fmtNum(ata.itens.length)} sub={`${fmtNum(ag.totalReg)} unidades registradas`}/>
        </div>

        <VigenciaTimeline ata={ata}/>
      </div>

      <div>
        <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:12}}>
          <h3 style={{fontSize:18,fontWeight:500,margin:0}}>Itens da ata</h3>
          <div style={{display:'flex',gap:10}}>
            <button className="btn btn-secondary" style={{minHeight:32,padding:'6px 14px'}}><i className="fas fa-filter"></i>FILTRAR</button>
            <button className="btn btn-primary" style={{minHeight:32,padding:'6px 14px'}}><i className="fas fa-download"></i>EXPORTAR CSV</button>
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {ata.itens.map((it, i) => (
            <ItemCard key={it.numero} item={it} expanded={!!expanded[i]}
                      onToggle={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}/>
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, sub, big }) {
  return (
    <div style={{padding:'14px 16px',background:'#FAFAFA',borderRadius:6}}>
      <div style={{fontSize:11,fontWeight:600,color:'#333',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>{label}</div>
      <div style={{fontSize: big ? 22 : 18,fontWeight:600,lineHeight:1.15,letterSpacing:'-0.01em',fontVariantNumeric:'tabular-nums',color:'#1a1a1a'}}>{value}</div>
      {sub && <div style={{fontSize:11,color:'#333',marginTop:4,lineHeight:1.4}}>{sub}</div>}
    </div>
  );
}

window.AtaDetail = AtaDetail;
