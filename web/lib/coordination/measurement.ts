// Explicit units only. Never assign SI units to a bare Autodesk number.
export function measurement(value:unknown,unit:string):number|null {
 if(typeof value!=='string')return null;
 const text=value.trim(),target=unit.toLowerCase();
 const match=text.match(/^([+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+))\s*(mm|cm|m|ft|in|%|mm\/m|cm\/m|m\/m|in\/ft|°|deg|l\/s|m\/s|kPa|mca|UEH|un)$/i);
 if(!match)return null;
 const number=Number(match[1].replace(',','.')),input=match[2].toLowerCase();
 if(!Number.isFinite(number))return null;
 if(input===target)return number;
 const length:Record<string,number>={mm:.001,cm:.01,m:1,ft:.3048,in:.0254};
 if(length[input]&&length[target])return number*length[input]/length[target];
 if(target==='%'){
  const slope:Record<string,number>={'mm/m':.1,'cm/m':1,'m/m':100,'in/ft':100/12};
  if(slope[input])return number*slope[input];
  if((input==='°'||input==='deg')&&Math.abs(number)<90)return Math.tan(number*Math.PI/180)*100;
 }
 return null;
}
