function ItemCard({ item, expanded, onToggle }) {
  const ag = aggregateItem(item);
  const riskExec = ag.execPct < 50;
  return (
    <div style={{border:'1px solid #E8E8E8',borderRadius:6,background:'#FFF',overflow:'hidden'}}>
      <div onClick={onToggle} style={{padding:'16px 20px',cursor:'pointer',display:'grid',gridTemplateColumns:'60px 1fr 160px 140px 28px',gap:16,alignItems:'center'}}>
        <div style={{fontSize:12,fontWeight:700,color:'#1351B4',fontVariantNumeric:'tabular-nums',letterSpacing:'0.03em'}}>#{item.numero}</div>
        <div>
          <div style={{fontSize:14,fontWeight:600,color:'#1a1a1a',marginBottom:4,lineHeight:1.3}}>{item.descricao}</div>
          <div style={{fontSize:11,color:'#333',letterSpacing:'0.02em'}}>
            <strong style={{fontWeight:600}}>{item.fornecedor}</strong> · CNPJ {item.cnpj}
          </div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:10,fontWeight:600,color:'#333',textTransform:'uppercase',letterSpacing:'0.05em'}}>Valor empenhado</div>
          <div style={{fontSize:18,fontWeight:600,lineHeight:1.1,fontVariantNumeric:'tabular-nums',color:'#1a1a1a'}}>{fmtBRL(ag.valorEmp)}</div>
          <div style={{fontSize:11,color:'#333',fontVariantNumeric:'tabular-nums'}}>de {fmtBRL(item.valorTotal)}</div>
        </div>
        <div>
          <div style={{display:'flex',alignItems:'baseline',gap:4}}>
            <div style={{fontSize:22,fontWeight:600,color: riskExec ? '#B00020' : '#1351B4',fontVariantNumeric:'tabular-nums',lineHeight:1}}>{ag.execPct}%</div>
            <div style={{fontSize:11,color:'#333'}}>executado</div>
          </div>
          <div style={{height:6,background:'#F0F0F0',borderRadius:3,marginTop:6,overflow:'hidden',display:'flex'}}>
            <div style={{width:ag.execPct+'%',background: riskExec ? '#B00020' : '#1351B4'}}/>
          </div>
          <div style={{fontSize:10,color:'#666',marginTop:4,fontVariantNumeric:'tabular-nums'}}>
            {fmtNum(ag.totalEmp)}/{fmtNum(ag.totalReg)} unidades empenhadas
          </div>
        </div>
        <i className={"fas fa-chevron-"+(expanded?'up':'down')} style={{color:'#1351B4',fontSize:14,justifySelf:'end'}}/>
      </div>
      {expanded && <UnidadesBreakdown item={item} ag={ag}/>}
    </div>
  );
}

function UnidadesBreakdown({ item, ag }) {
  const maxReg = Math.max(...item.empenhos.map(e => e.registrada));
  return (
    <div style={{padding:'18px 20px',background:'#FAFAFA',borderTop:'1px solid #E8E8E8'}}>
      <div style={{display:'grid',gridTemplateColumns:'3fr 1.5fr 1fr 1fr 1fr',gap:12,fontSize:10,fontWeight:600,color:'#333',textTransform:'uppercase',letterSpacing:'0.05em',paddingBottom:10,borderBottom:'1px solid #E8E8E8'}}>
        <div>Unidade</div>
        <div>Execução</div>
        <div style={{textAlign:'right'}}>Registrada</div>
        <div style={{textAlign:'right'}}>Empenhada</div>
        <div style={{textAlign:'right'}}>Saldo</div>
      </div>
      {item.empenhos.map((e, i) => {
        const pp = pct(e.empenhada, e.registrada);
        const risk = pp < 50 && e.saldo > 0;
        const fullBar = (e.registrada / maxReg) * 100;
        const empBar  = (e.empenhada / maxReg) * 100;
        return (
          <div key={i} style={{display:'grid',gridTemplateColumns:'3fr 1.5fr 1fr 1fr 1fr',gap:12,padding:'12px 0',borderBottom:'1px solid #F0F0F0',alignItems:'center'}}>
            <div>
              <div style={{fontSize:13,color:'#1a1a1a',fontWeight:500}}>{e.unidade}</div>
              <div style={{fontSize:10,fontWeight:600,letterSpacing:'0.05em',color: e.tipo==='PARTICIPANTE'?'#0D47A1':'#455A64',textTransform:'uppercase',marginTop:2}}>
                {e.tipo}
              </div>
            </div>
            <div style={{position:'relative',height:18,background:'#E8E8E8',borderRadius:3,overflow:'hidden'}}>
              <div style={{position:'absolute',left:0,top:0,height:'100%',width:fullBar+'%',background:'#CCC'}}/>
              <div style={{position:'absolute',left:0,top:0,height:'100%',width:empBar+'%',background: risk ? '#B00020' : '#1351B4'}}/>
              <div style={{position:'absolute',right:4,top:0,height:'100%',display:'flex',alignItems:'center',fontSize:10,color:'#1a1a1a',fontWeight:600,fontVariantNumeric:'tabular-nums',mixBlendMode:'multiply'}}>
                {pp}%
              </div>
            </div>
            <div style={{textAlign:'right',fontSize:13,fontVariantNumeric:'tabular-nums'}}>{fmtNum(e.registrada)}</div>
            <div style={{textAlign:'right',fontSize:13,fontVariantNumeric:'tabular-nums',fontWeight:500}}>{fmtNum(e.empenhada)}</div>
            <div style={{textAlign:'right',fontSize:13,fontVariantNumeric:'tabular-nums',color: e.saldo>0 ? '#B00020' : '#333',fontWeight: e.saldo>0?600:400}}>{fmtNum(e.saldo)}</div>
          </div>
        );
      })}
    </div>
  );
}

window.ItemCard = ItemCard;
