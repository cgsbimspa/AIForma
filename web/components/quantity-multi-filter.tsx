"use client";
import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

export function QuantityMultiFilter({label,values,selected,disabled,onChange}:{label:string;values:string[];selected:string[];disabled:boolean;onChange:(values:string[])=>void}) {
 const id=useId(),[query,setQuery]=useState('');
 const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
 const options=[...new Set([...values,...selected])].sort((a,b)=>a.localeCompare(b,'es',{numeric:true})).filter(v=>normalize(v).includes(normalize(query)));
 const text=selected.length===0?'Todos':selected.length===1?selected[0]:`${selected.length} seleccionados`;
 return <div className="qv2-multi-filter"><span id={id}>{label}</span><Popover onOpenChange={()=>setQuery('')}><PopoverTrigger asChild><button className="qv2-filter-trigger" disabled={disabled} aria-label={`${label}: ${text}`} title={selected.join(', ')||'Todos'}><span>{text}</span><ChevronDown size={14}/></button></PopoverTrigger><PopoverContent align="start" className="qv2-filter-popover" aria-labelledby={id}><div className="qv2-filter-popover-heading"><strong>{label}</strong><button onClick={()=>onChange([])} disabled={!selected.length}>Todos</button></div><input aria-label={`Buscar en ${label}`} placeholder="Buscar opciones…" value={query} onChange={e=>setQuery(e.target.value)}/><div className="qv2-filter-options">{options.map(value=><label key={value}><input type="checkbox" checked={selected.includes(value)} onChange={e=>onChange(e.target.checked?[...selected,value]:selected.filter(v=>v!==value))}/><span>{value}{!values.includes(value)&&<small>Sin coincidencias con los otros filtros</small>}</span></label>)}{!options.length&&<p>No hay opciones para esta búsqueda.</p>}</div><p>Puedes marcar más de una opción.</p></PopoverContent></Popover></div>;
}
