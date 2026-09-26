import type { Project, Scale } from './model';
import { scheduleProjectPlan } from './schedule';
import { ganttTreeLayout } from './ganttLayout';
import { GANTT_BAR_TOP, GANTT_LAYOUT_SIZING, GANTT_PARENT_INSET, GANTT_PARENT_MIN_HEIGHT, GANTT_SIZING } from './ganttSizing';
import { GANTT_ZOOM_LEVELS } from './ganttZoom';
import { statusColorsByTheme } from './theme';

export type InteractiveExportOptions = {
  scale: Scale;
  filter: Project['project']['default_filter'];
  draft?: boolean;
  exportedAt?: Date;
};

const scaleNames: Record<Scale, string> = {
  day: '天', week: '周', 'half-month': '半月', month: '月', quarter: '季度', 'half-year': '半年', year: '年',
};

const VIEWER_CSS = String.raw`
:root{--edge-base:#6a9989;--edge-active:#007d70;--edge-assignee:#647f9c;--edge-assignee-active:#476b91;--edge-marker:#007d70;--edge-glow:#22c6ad88;color-scheme:light;font-family:Inter,"Noto Sans SC","Microsoft YaHei",system-ui,sans-serif;color:#33443b;background:#f4f6f2}
*{box-sizing:border-box}body{margin:0;background:#f4f6f2}button,input,select{font:inherit;color:inherit}button{cursor:pointer}
header{position:sticky;top:0;z-index:60;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:15px 24px;background:#fffffff2;border-bottom:1px solid #dfe7df;backdrop-filter:blur(10px)}
.brand{display:flex;align-items:center;gap:12px;min-width:0}.logo{display:grid;place-items:center;width:38px;height:38px;border-radius:10px;background:#177b70;color:#fff;font:700 23px Georgia}.brand h1{margin:0;font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.brand p{margin:3px 0 0;color:#8a998f;font-size:10px}.header-meta{color:#849187;font-size:11px;text-align:right;white-space:nowrap}
main{padding:20px 24px 32px}.toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;padding:12px;background:#fff;border:1px solid #dfe6df;border-radius:10px}.toolbar button,.toolbar select,.toolbar input{min-height:32px;border:1px solid #d5dfd7;border-radius:6px;background:#fff;padding:6px 10px}.toolbar button.active{border-color:#79aa98;background:#e8f4ed;color:#176b58}.toolbar button:hover{background:#f0f6f2}.toolbar input{width:220px}.toolbar .spacer{flex:1}.toolbar small{color:#8b998f}
.shell{position:relative;background:#fff;border:1px solid #dce5de;border-radius:10px;overflow:hidden;box-shadow:0 3px 14px #25382908}.caption{display:flex;justify-content:space-between;gap:15px;padding:10px 16px;border-bottom:1px solid #e7ece7;color:#849187;font-size:11px}.scroll{position:relative;overflow:auto;max-height:calc(100vh - 205px);min-height:420px;cursor:grab}.scroll.panning{cursor:grabbing;user-select:none}.canvas{position:relative;min-height:420px}.head{position:sticky;top:0;z-index:50;height:50px;background:#f8faf7;border-bottom:1px solid #dfe7df}.labels-head{position:absolute;left:0;top:0;height:50px;padding:17px 14px;background:#f8faf7;border-right:1px solid #dfe7df;font-size:11px;font-weight:650}.axis{position:absolute;top:0;height:50px}.axis-cell{position:absolute;top:0;height:50px;padding-top:13px;border-right:1px solid #e1e8e1;text-align:center;color:#718278;font-size:10px;white-space:nowrap;overflow:hidden}.axis-cell small{display:block;margin-top:4px;color:#98a49c;font-size:8px}
.body{position:relative}.grid{position:absolute;top:0;bottom:0;overflow:hidden;background-image:linear-gradient(to right,#e6ece6 1px,transparent 1px)}.rest{position:absolute;top:0;bottom:0;background:#eef1e999}.today{position:absolute;top:0;bottom:0;border-left:1px dashed #d59b47}.today span{position:absolute;top:2px;padding:2px 4px;background:#fff5dc;color:#986c2c;font-size:9px}.labels{position:absolute;left:0;top:0;z-index:40;background:#fff;border-right:1px solid #dfe7df}.label{position:absolute;left:0;display:flex;align-items:center;gap:7px;padding:0 10px;border-bottom:1px solid #edf1ed;background:#fff;cursor:pointer}.label.parent{background:#f7faf6;font-weight:650;cursor:grab}.label:hover,.label.related{background:#edf7f1}.label.dim{opacity:.25}.twisty{width:18px;border:0;background:transparent;padding:2px;color:#477c68}.order{width:30px;color:#9aa69e;font:10px ui-monospace,monospace}.name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.assignee{margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#8b998f;font-size:10px}
.bars{position:absolute;top:0}.bar{position:absolute;display:flex;align-items:center;min-width:8px;border:1px solid;border-radius:5px;padding:0 9px;overflow:hidden;cursor:pointer;box-shadow:0 2px 4px #1c3a270c}.bar.parent{cursor:grab}.scroll.panning .bar.parent,.scroll.panning .label.parent{cursor:grabbing}.bar.parent.expanded{align-items:flex-start;padding-top:7px;background:transparent!important;border-width:2px;border-radius:8px}.bar span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;font-weight:600}.bar:hover,.bar.related{outline:3px solid #168477;outline-offset:2px}.bar.selected{outline:3px solid #176cbd;outline-offset:2px}.bar.dim{opacity:.18}.bar.late{border-color:#d16455!important;border-width:2px;animation:pulse 1.8s ease-in-out infinite}@keyframes pulse{50%{box-shadow:0 0 11px #d1645577}}@media(prefers-reduced-motion:reduce){.bar.late{animation:none}}
.bar.parent.expanded{padding-top:${GANTT_SIZING.parentLabelTop}px}
.edges{position:absolute;top:0;z-index:30;overflow:visible;pointer-events:none}.edge{fill:none;stroke:var(--edge-base);stroke-width:1.5;opacity:.16}.edge-arrowhead{stroke-linecap:round}#arrow path{stroke:var(--edge-marker)}.edge.assignee{stroke:var(--edge-assignee);stroke-dasharray:6 4}.edge.assignee .edge-arrowhead{stroke-dasharray:none}.edge.related{stroke:var(--edge-active);stroke-width:3;opacity:1;filter:drop-shadow(0 0 1px var(--edge-glow))}.edge.assignee.related{stroke:var(--edge-assignee-active)}.edge.dim{opacity:.04}.empty{padding:80px;text-align:center;color:#96a39a}
.edge.related,.edge.related .edge-arrowhead{stroke-width:1.5px}
.details{position:fixed;right:18px;top:88px;z-index:80;width:350px;max-height:calc(100vh - 110px);overflow:auto;padding:20px;border:1px solid #d9e4dc;border-radius:12px;background:#fff;box-shadow:0 16px 55px #1831242e}.details[hidden]{display:none}.details h2{margin:0 30px 4px 0;font-size:18px}.details .close{position:absolute;right:13px;top:11px;border:0;background:transparent;font-size:22px}.details .desc{margin:14px 0;padding:10px;border-radius:6px;background:#f5f7f4;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;line-height:1.55}.details dl{display:grid;grid-template-columns:88px 1fr;gap:8px;margin:15px 0;font-size:11px}.details dt{color:#87968d}.details dd{margin:0;overflow-wrap:anywhere}.pill{display:inline-block;margin:2px 4px 2px 0;padding:3px 7px;border-radius:999px;background:#edf3ee;font-size:10px}.warning{color:#b44f42;font-weight:650}.footer{padding:12px 16px;border-top:1px solid #e7ece7;color:#8a978e;font-size:10px}
@media(max-width:760px){header{align-items:flex-start;padding:12px}.header-meta{display:none}main{padding:12px}.toolbar input{width:150px}.caption span:last-child{display:none}.details{inset:70px 10px auto 10px;width:auto}.scroll{max-height:calc(100vh - 230px)}}
html[data-theme="dark"]{--edge-base:#82e6ff;--edge-active:#82e6ff;--edge-assignee:#82e6ff;--edge-assignee-active:#82e6ff;--edge-marker:#82e6ff;--edge-glow:#82e6ff99;color-scheme:dark;color:#ededed;background:#121212}
html[data-theme="dark"] body{background:#121212}
html[data-theme="dark"] header{background:#1b1b1bf2;border-color:#3c3c3c}
html[data-theme="dark"] .logo{background:#4c4c4c}
html[data-theme="dark"] .toolbar,html[data-theme="dark"] .shell,html[data-theme="dark"] .details{background:#202020;border-color:#404040}
html[data-theme="dark"] .toolbar button,html[data-theme="dark"] .toolbar select,html[data-theme="dark"] .toolbar input{background:#292929;border-color:#494949;color:#ededed}
html[data-theme="dark"] .toolbar button:hover,html[data-theme="dark"] .toolbar button.active{background:#393939;color:#fff}
html[data-theme="dark"] .head,html[data-theme="dark"] .labels-head{background:#292929;border-color:#3c3c3c}
html[data-theme="dark"] .labels,html[data-theme="dark"] .label{background:#202020;border-color:#3c3c3c}
html[data-theme="dark"] .label.parent,html[data-theme="dark"] .label:hover,html[data-theme="dark"] .label.related{background:#303030}
html[data-theme="dark"] .grid{background-image:linear-gradient(to right,#ffffff18 1px,transparent 1px)}
html[data-theme="dark"] .rest{background:#38383878}
html[data-theme="dark"] .today span,html[data-theme="dark"] .details .desc,html[data-theme="dark"] .pill{background:#303030;color:#ededed}
html[data-theme="dark"] .edge{opacity:.16}
html[data-theme="dark"] .edge.related{opacity:1}
html[data-theme="dark"] .edge.dim{opacity:.05}
html[data-theme="dark"] .caption,html[data-theme="dark"] .footer,html[data-theme="dark"] .axis-cell{border-color:#3c3c3c;color:#b5b5b5}
@media print{header,.toolbar,.caption,.details,.footer{display:none!important}main{padding:0}.shell{border:0;box-shadow:none}.scroll{max-height:none;overflow:visible}.head{position:relative}}
`;

const VIEWER_SCRIPT = String.raw`
(function(){
  'use strict';
  var payload=JSON.parse(document.getElementById('task-manager-data').textContent);
  var project=payload.project, statusColors=payload.statusColors, tasks=project.tasks.slice().sort(function(a,b){return a.order-b.order}), byUid=new Map(tasks.map(function(t){return[t.uid,t]})),parentUids=new Set(tasks.filter(function(t){return t.parent_uid}).map(function(t){return t.parent_uid})),dependencyEdges=payload.dependencies;
  var schedules=new Map(payload.schedules.map(function(s){return[s.uid,s]}));
  var state={scale:payload.view.scale,labels:payload.view.filter.labels.slice(),mode:payload.view.filter.mode,query:'',selected:null,hover:null,zoom:1},pan=null,suppressClick=false;
  var ZOOM_LEVELS=${JSON.stringify(GANTT_ZOOM_LEVELS)},LAYOUT_SIZING=${JSON.stringify(GANTT_LAYOUT_SIZING)},ganttTreeLayout=${ganttTreeLayout.toString()};
  var ppdValues={day:72,week:22,'half-month':12,month:7,quarter:2.6,'half-year':1.4,year:.75};
  var scaleLabels={day:'天',week:'周','half-month':'半月',month:'月',quarter:'季度','half-year':'半年',year:'年'};
  var DAY=86400000,labelWidth=280,scroll=document.getElementById('scroll'), details=document.getElementById('details');
  function dayNumber(date){return Math.floor(Date.parse(date+'T00:00:00Z')/DAY)}
  function dateString(day){return new Date(day*DAY).toISOString().slice(0,10)}
  function slotText(slot){var day=Math.floor(slot/2);return dateString(day)+' '+(slot%2===0?'上午':'下午')}
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function childrenMap(){var map=new Map();tasks.forEach(function(t){var key=t.parent_uid||'';if(!map.has(key))map.set(key,[]);map.get(key).push(t)});return map}
  function descendants(uid,map){var result=new Set(),pending=(map.get(uid)||[]).slice();while(pending.length){var child=pending.pop();if(result.has(child.uid))continue;result.add(child.uid);pending.push.apply(pending,map.get(child.uid)||[])}return result}
  function matches(t){var query=state.query.trim().toLowerCase();var labelOk=!state.labels.length||(state.mode==='and'?state.labels.every(function(x){return t.labels.includes(x)}):state.labels.some(function(x){return t.labels.includes(x)}));var searchOk=!query||[t.name,t.uid,t.assignee,t.description,String(t.order)].some(function(x){return String(x).toLowerCase().includes(query)});return labelOk&&searchOk}
  function focusVisible(uid){var map=childrenMap(),members=descendants(uid,map);members.add(uid);var core=new Set([uid]);dependencyEdges.forEach(function(edge){var fromInside=members.has(edge.from),toInside=members.has(edge.to);if(fromInside!==toInside)core.add(fromInside?edge.to:edge.from)});var visible=new Set(core);core.forEach(function(coreUid){var parent=byUid.get(coreUid)&&byUid.get(coreUid).parent_uid;while(parent){visible.add(parent);parent=byUid.get(parent)&&byUid.get(parent).parent_uid}});return visible}
  function visibleSet(){if(state.selected)return focusVisible(state.selected);var result=new Set();tasks.filter(matches).forEach(function(t){result.add(t.uid);var parent=t.parent_uid;while(parent){result.add(parent);parent=byUid.get(parent)&&byUid.get(parent).parent_uid}});return result}
  function layout(){var map=childrenMap(),visible=visibleSet(),tree=ganttTreeLayout({tasks:tasks},visible,LAYOUT_SIZING);return{items:tree.items,height:Math.max(360,tree.height),visible:visible,map:map}}
  function endpoint(uid,displayed){if(displayed.has(uid))return uid;var parent=byUid.get(uid)&&byUid.get(uid).parent_uid;while(parent){var p=byUid.get(parent);if(displayed.has(parent)&&(p.collapse_children||parent===state.selected))return parent;parent=p&&p.parent_uid}return null}
  function edges(displayed){var byPair=new Map(),result=[];dependencyEdges.forEach(function(edge){var from=endpoint(edge.from,displayed),to=endpoint(edge.to,displayed),key=from+'\0'+to;if(!from||!to||from===to)return;var existing=byPair.get(key);if(existing===undefined){byPair.set(key,result.length);result.push({from:from,to:to,kind:edge.kind})}else if(edge.kind==='explicit')result[existing]={from:from,to:to,kind:'explicit'}});return result}
  function alignStart(day,scale){var d=new Date(dateString(day)+'T00:00:00Z'),y=d.getUTCFullYear(),m=d.getUTCMonth(),date=d.getUTCDate();if(scale==='day')return day;if(scale==='week')return day-((d.getUTCDay()+6)%7);if(scale==='half-month')return dayNumber(y+'-'+String(m+1).padStart(2,'0')+'-'+(date>15?'16':'01'));var step=scale==='month'?1:scale==='quarter'?3:scale==='half-year'?6:12;return Date.UTC(y,Math.floor(m/step)*step,1)/DAY}
  function columns(start,end,scale){var result=[],cursor=start;while(cursor<end){var d=new Date(dateString(cursor)+'T00:00:00Z'),y=d.getUTCFullYear(),m=d.getUTCMonth(),date=d.getUTCDate(),next,label;if(scale==='day'){next=cursor+1;label=(m+1)+'/'+date}else if(scale==='week'){next=cursor+(8-(d.getUTCDay()||7));label=(m+1)+'/'+date+' 起'}else if(scale==='half-month'){next=Date.UTC(y,m+(date>15?1:0),date>15?1:16)/DAY;label=y+'/'+(m+1)+(date>15?' 下':' 上')}else{var step=scale==='month'?1:scale==='quarter'?3:scale==='half-year'?6:12;next=Date.UTC(y,Math.floor(m/step)*step+step,1)/DAY;label=scale==='month'?y+'/'+(m+1):scale==='quarter'?y+' Q'+(Math.floor(m/3)+1):scale==='half-year'?y+(m<6?' 上半年':' 下半年'):y+'年'}result.push({start:cursor,end:Math.min(next,end),label:label});cursor=next}return result}
  function dependencyCurve(ax,ay,bx,by){var c1x=ax+22,c2x=bx-22,mx=(ax+3*c1x+3*c2x+bx)/8,my=(ay+3*ay+3*by+by)/8,dx=3*((c1x-ax)+2*(c2x-c1x)+(bx-c2x))/4,dy=3*((ay-ay)+2*(by-ay)+(by-by))/4,length=Math.hypot(dx,dy)||1,ux=dx/length,uy=dy/length;return{path:'M'+ax+','+ay+' C'+c1x+','+ay+' '+c2x+','+by+' '+bx+','+by,x1:mx-ux*5,y1:my-uy*5,x2:mx+ux*5,y2:my+uy*5}}
  function relationSet(uid,edgeList){var set=new Set(uid?[uid]:[]);if(uid)edgeList.forEach(function(e){if(e.from===uid||e.to===uid){set.add(e.from);set.add(e.to)}});return set}
  function render(){var oldLeft=scroll.scrollLeft,oldTop=scroll.scrollTop,tree=layout(),items=tree.items,itemMap=new Map(items.map(function(i){return[i.task.uid,i]})),displayed=new Set(itemMap.keys()),edgeList=edges(displayed),focus=state.selected||state.hover,related=relationSet(focus,edgeList),ppd=ppdValues[state.scale]*state.zoom;
    var scheduled=items.map(function(i){return schedules.get(i.task.uid)}).filter(Boolean),origin=alignStart(Math.min.apply(null,[dayNumber(project.project.start_date)-2].concat(scheduled.map(function(s){return Math.floor(s.start/2)-2}))),state.scale),end=Math.max.apply(null,[origin+Math.ceil(Math.max(1000,window.innerWidth-labelWidth-50)/ppd)].concat(scheduled.map(function(s){return Math.ceil(s.end/2)+10}))),width=Math.max(1000,Math.ceil((end-origin)*ppd)),height=tree.height;
    document.getElementById('range').textContent=dateString(origin)+' — '+dateString(end-1);document.getElementById('count').textContent=items.length+' / '+tasks.length+' 条任务';
    state.origin=origin;state.ppd=ppd;
    var axis=columns(origin,end,state.scale).map(function(c){return '<div class="axis-cell" style="left:'+((c.start-origin)*ppd)+'px;width:'+((c.end-c.start)*ppd)+'px">'+esc(c.label)+(state.scale==='day'?'<small>上午　下午</small>':'')+'</div>'}).join('');
    var rest='';if(ppd>=3&&end-origin<=5000){for(var day=origin;day<end;day++){var dow=new Date(dateString(day)+'T00:00:00Z').getUTCDay();if(dow===0||dow===6)rest+='<i class="rest" style="left:'+((day-origin)*ppd)+'px;width:'+ppd+'px"></i>'}}
    var labels=items.map(function(i){var dim=focus&&!related.has(i.task.uid),kids=(tree.map.get(i.task.uid)||[]).length,collapsed=kids&&i.task.collapse_children;return '<div class="label '+(i.isParent?'parent ':'')+(related.has(i.task.uid)?'related ':'')+(dim?'dim':'')+'" data-uid="'+esc(i.task.uid)+'" style="top:'+(i.top+(i.isParent?${GANTT_PARENT_INSET}:${GANTT_BAR_TOP}))+'px;height:${GANTT_SIZING.barHeight}px;padding-left:'+(10+i.depth*17)+'px"><button class="twisty" data-collapse="'+esc(i.task.uid)+'" '+(!kids?'disabled':'')+'>'+(kids?(collapsed?'▸':'▾'):'')+'</button><span class="order">'+i.task.order+'</span><span class="name">'+esc(i.task.name)+'</span>'+(!i.isParent?'<span class="assignee">'+esc(i.task.assignee)+'</span>':'')+'</div>'}).join('');
    var bars=items.map(function(i){var t=i.task,s=schedules.get(t.uid);if(!s)return'';var left=(s.start-origin*2)*ppd/2,barWidth=Math.max(8,(s.end-s.start)*ppd/2),parent=i.isParent,color=statusColors[t.status],dim=focus&&!related.has(t.uid),style=(parent&&!t.collapse_children?'background:transparent;':'background:'+color.fill+';')+'border-color:'+color.border+';color:'+color.text+';left:'+left+'px;width:'+barWidth+'px;top:'+(i.top+(parent?${GANTT_PARENT_INSET}:${GANTT_BAR_TOP}))+'px;height:'+(parent?Math.max(${GANTT_PARENT_MIN_HEIGHT},i.height-${GANTT_PARENT_INSET * 2}):${GANTT_SIZING.barHeight})+'px';return '<div class="bar '+(parent?'parent ':'')+(parent&&!t.collapse_children?'expanded ':'')+(s.late?'late ':'')+(related.has(t.uid)?'related ':'')+(state.selected===t.uid?'selected ':'')+(dim?'dim':'')+'" data-uid="'+esc(t.uid)+'" style="'+style+'"><span>'+esc(t.name)+'</span></div>'}).join('');
    var paths=edgeList.map(function(e){var a=schedules.get(e.from),b=schedules.get(e.to),from=itemMap.get(e.from),to=itemMap.get(e.to);if(!a||!b||!from||!to)return'';var ax=(a.end-origin*2)*ppd/2,ay=from.top+${GANTT_SIZING.rowHeight / 2},bx=(b.start-origin*2)*ppd/2,by=to.top+${GANTT_SIZING.rowHeight / 2},curve=dependencyCurve(ax,ay,bx,by),isRelated=focus&&(e.from===focus||e.to===focus);return '<g class="edge '+(e.kind==='assignee'?'assignee ':'explicit ')+(isRelated?'related ':'')+(focus&&!isRelated?'dim':'')+'" data-from="'+esc(e.from)+'" data-to="'+esc(e.to)+'"><path d="'+curve.path+'"></path><line class="edge-arrowhead" x1="'+curve.x1+'" y1="'+curve.y1+'" x2="'+curve.x2+'" y2="'+curve.y2+'" marker-end="url(#arrow)"></line></g>'}).join('');
    document.getElementById('canvas').style.width=(width+labelWidth)+'px';document.getElementById('labels-head').style.width=labelWidth+'px';document.getElementById('axis').style.cssText='left:'+labelWidth+'px;width:'+width+'px';document.getElementById('axis').innerHTML=axis;
    document.getElementById('body').style.height=height+'px';document.getElementById('grid').style.cssText='left:'+labelWidth+'px;width:'+width+'px;background-size:'+ppd+'px 100%';document.getElementById('grid').innerHTML=rest+'<i class="today" style="left:'+((dayNumber(payload.today)-origin)*ppd)+'px"><span>今天</span></i>';
    document.getElementById('labels').style.cssText='width:'+labelWidth+'px;height:'+height+'px;transform:translateX('+scroll.scrollLeft+'px)';document.getElementById('labels').innerHTML=labels;document.getElementById('bars').style.cssText='left:'+labelWidth+'px;width:'+width+'px;height:'+height+'px';document.getElementById('bars').innerHTML=bars;document.getElementById('edges').setAttribute('width',String(width));document.getElementById('edges').setAttribute('height',String(height));document.getElementById('edges').style.left=labelWidth+'px';document.getElementById('edge-paths').innerHTML=paths;
    bindTasks();scroll.scrollLeft=oldLeft;scroll.scrollTop=oldTop;showDetails(state.selected)
  }
  function applyFocus(){var focus=state.selected||state.hover,related=new Set(focus?[focus]:[]);document.querySelectorAll('.edge').forEach(function(edge){var hit=focus&&(edge.dataset.from===focus||edge.dataset.to===focus);edge.classList.toggle('related',!!hit);edge.classList.toggle('dim',!!state.selected&&!hit);if(hit){related.add(edge.dataset.from);related.add(edge.dataset.to)}});document.querySelectorAll('[data-uid]').forEach(function(el){var hit=related.has(el.dataset.uid);el.classList.toggle('related',hit);el.classList.toggle('dim',!!state.selected&&!hit);el.classList.toggle('selected',el.classList.contains('bar')&&state.selected===el.dataset.uid)})}
  function bindTasks(){document.querySelectorAll('[data-uid]').forEach(function(el){el.addEventListener('mouseenter',function(){state.hover=el.dataset.uid;applyFocus()});el.addEventListener('mouseleave',function(){state.hover=null;applyFocus()});el.addEventListener('click',function(e){if(suppressClick){suppressClick=false;e.preventDefault();e.stopPropagation();return}if(e.target.closest('[data-collapse]')||parentUids.has(el.dataset.uid))return;state.selected=state.selected===el.dataset.uid?null:el.dataset.uid;render()})});document.querySelectorAll('[data-collapse]').forEach(function(el){el.addEventListener('click',function(e){e.stopPropagation();var t=byUid.get(el.dataset.collapse);t.collapse_children=!t.collapse_children;render()})})}
  function showDetails(uid){if(!uid){details.hidden=true;return}var t=byUid.get(uid),s=schedules.get(uid),incoming=dependencyEdges.filter(function(e){return e.to===uid}).map(function(e){return(byUid.get(e.from)&&byUid.get(e.from).name||e.from)+(e.kind==='assignee'?'（自动串行）':'')}),outgoing=dependencyEdges.filter(function(e){return e.from===uid}).map(function(e){return(byUid.get(e.to)&&byUid.get(e.to).name||e.to)+(e.kind==='assignee'?'（自动串行）':'')});details.hidden=false;details.innerHTML='<button class="close" aria-label="关闭">×</button><h2>'+esc(t.name)+'</h2><small>'+esc(t.uid)+'</small>'+(t.description?'<div class="desc">'+esc(t.description)+'</div>':'')+'<dl><dt>状态</dt><dd>'+esc(t.status)+'</dd><dt>执行人</dt><dd>'+esc(t.assignee)+'</dd><dt>计算排期</dt><dd>'+(s?slotText(s.start)+' — '+slotText(s.end-1):'—')+(s&&s.late?' <span class="warning">超期</span>':'')+'</dd><dt>预计耗时</dt><dd>'+t.duration_days+' 天</dd><dt>前置任务</dt><dd>'+esc(incoming.join('、')||'无')+'</dd><dt>后续任务</dt><dd>'+esc(outgoing.join('、')||'无')+'</dd><dt>标签</dt><dd>'+t.labels.map(function(x){return'<span class="pill">'+esc(x)+'</span>'}).join('')+'</dd></dl>';details.querySelector('.close').addEventListener('click',function(){state.selected=null;render()})}
  document.querySelectorAll('[data-scale]').forEach(function(b){b.addEventListener('click',function(){state.scale=b.dataset.scale;document.querySelectorAll('[data-scale]').forEach(function(x){x.classList.toggle('active',x===b)});render()})});
  document.getElementById('search').addEventListener('input',function(e){state.query=e.target.value;state.selected=null;render()});document.getElementById('mode').value=state.mode;document.getElementById('mode').addEventListener('change',function(e){state.mode=e.target.value;render()});
  var labelFilter=document.getElementById('labels-filter');labelFilter.innerHTML=[''].concat(payload.labels).map(function(x){return'<option value="'+esc(x)+'">'+(x?esc(x):'全部标签')+'</option>'}).join('');if(state.labels.length===1)labelFilter.value=state.labels[0];else if(state.labels.length>1){labelFilter.insertAdjacentHTML('beforeend','<option value="__current_filter__">当前筛选：'+esc(state.labels.join('、'))+'</option>');labelFilter.value='__current_filter__'}labelFilter.addEventListener('change',function(e){if(e.target.value==='__current_filter__')return;state.labels=e.target.value?[e.target.value]:[];render()});
  function changeZoom(next){if(ZOOM_LEVELS.indexOf(next)<0||next===state.zoom)return;var timelineWidth=Math.max(0,scroll.clientWidth-labelWidth),anchor=state.origin*2+(scroll.scrollLeft+timelineWidth/2)*2/state.ppd;state.zoom=next;render();scroll.scrollLeft=Math.max(0,(anchor-state.origin*2)*state.ppd/2-timelineWidth/2)}
  document.getElementById('zoom-in').addEventListener('click',function(){var index=ZOOM_LEVELS.indexOf(state.zoom);changeZoom(ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length-1,index+1)])});document.getElementById('zoom-out').addEventListener('click',function(){var index=ZOOM_LEVELS.indexOf(state.zoom);changeZoom(ZOOM_LEVELS[Math.max(0,index-1)])});document.getElementById('reset').addEventListener('click',function(){state.selected=null;state.hover=null;state.query='';state.labels=[];state.zoom=1;document.getElementById('search').value='';document.getElementById('labels-filter').value='';render();scroll.scrollLeft=0});
  document.body.addEventListener('click',function(e){if(suppressClick){suppressClick=false;return}if(!state.selected)return;var taskTarget=e.target.closest('[data-uid]');if(taskTarget&&!parentUids.has(taskTarget.dataset.uid))return;state.selected=null;state.hover=null;render()});scroll.addEventListener('scroll',function(){document.getElementById('labels').style.transform='translateX('+scroll.scrollLeft+'px)'});
  scroll.addEventListener('pointerdown',function(e){if(e.button!==0||e.target.closest('button,input,select')||e.target.closest('.bar[data-uid]:not(.parent)'))return;pan={pointerId:e.pointerId,x:e.clientX,y:e.clientY,left:scroll.scrollLeft,top:scroll.scrollTop,moved:false};scroll.classList.add('panning');scroll.setPointerCapture(e.pointerId)});scroll.addEventListener('pointermove',function(e){if(!pan||e.pointerId!==pan.pointerId)return;var dx=e.clientX-pan.x,dy=e.clientY-pan.y;if(Math.abs(dx)>4||Math.abs(dy)>4)pan.moved=true;scroll.scrollLeft=pan.left-dx;scroll.scrollTop=pan.top-dy});function endPan(e){if(!pan||e.pointerId!==pan.pointerId)return;if(pan.moved){suppressClick=true;setTimeout(function(){suppressClick=false},0)}pan=null;scroll.classList.remove('panning')}scroll.addEventListener('pointerup',endPan);scroll.addEventListener('pointercancel',endPan);
  document.querySelector('[data-scale="'+state.scale+'"]').classList.add('active');document.getElementById('draft').hidden=!payload.draft;render();
})();
`;

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => ({
    '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029',
  }[character] ?? character));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
}

export function interactiveExportFilename(projectName: string, date = new Date()) {
  const safe = projectName.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').slice(0, 80) || 'TaskManager';
  const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `${safe}_甘特图_${localDate}.html`;
}

export function createInteractiveGanttHtml(project: Project, options: InteractiveExportOptions) {
  const exportedAt = options.exportedAt ?? new Date();
  const plan = scheduleProjectPlan(project);
  const schedule = plan.schedule;
  const dependencies = plan.dependencyEdges;
  const payload = {
    project,
    statusColors: statusColorsByTheme[project.project.theme],
    schedules: [...schedule].map(([uid, value]) => ({ uid, ...value })),
    dependencies,
    view: { scale: options.scale, filter: options.filter },
    labels: [...new Set(project.tasks.flatMap(task => task.labels))].sort(),
    draft: !!options.draft,
    today: `${exportedAt.getFullYear()}-${String(exportedAt.getMonth() + 1).padStart(2, '0')}-${String(exportedAt.getDate()).padStart(2, '0')}`,
    exportedAt: exportedAt.toISOString(),
  };
  const scaleButtons = (Object.keys(scaleNames) as Scale[]).map(scale => `<button type="button" data-scale="${scale}">${scaleNames[scale]}</button>`).join('');
  const title = escapeHtml(project.project.name);
  return `<!doctype html>
<html lang="zh-CN" data-theme="${project.project.theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:">
<title>${title} · 交互式甘特图</title><style>${VIEWER_CSS}</style></head><body>
<header><div class="brand"><span class="logo">T</span><div><h1>${title}</h1><p>TaskManager 交互式甘特图 · 只读快照</p></div></div><div class="header-meta">导出于 ${escapeHtml(exportedAt.toLocaleString('zh-CN'))}<br><span id="draft" class="warning">包含未保存草稿</span></div></header>
<main><div class="toolbar"><input id="search" type="search" placeholder="搜索名称、UID、执行人…" aria-label="搜索任务"><select id="labels-filter" aria-label="标签筛选"></select><select id="mode" aria-label="标签匹配模式"><option value="or">任一标签</option><option value="and">全部标签</option></select>${scaleButtons}<span class="spacer"></span><button id="zoom-out" type="button">缩小</button><button id="zoom-in" type="button">放大</button><button id="reset" type="button">重置视图</button></div>
<section class="shell"><div class="caption"><span id="range"></span><span>悬浮仅高亮依赖 · 单击叶子任务聚焦 · 点击任意非叶子任务区域恢复</span><span id="count"></span></div><div id="scroll" class="scroll"><div id="canvas" class="canvas"><div class="head"><div id="labels-head" class="labels-head">任务 / 执行人</div><div id="axis" class="axis"></div></div><div id="body" class="body"><div id="grid" class="grid"></div><div id="labels" class="labels"></div><div id="bars" class="bars"></div><svg id="edges" class="edges"><defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7" fill="none" stroke-width="1.5"></path></marker></defs><g id="edge-paths"></g></svg></div></div></div><div class="footer">该文件是离线只读快照，不会连接 TaskManager 服务或修改 YAML。</div></section></main>
<aside id="details" class="details" hidden></aside><script id="task-manager-data" type="application/json">${safeJson(payload)}</script><script>${VIEWER_SCRIPT}</script></body></html>`;
}

export function downloadInteractiveGanttHtml(project: Project, options: InteractiveExportOptions) {
  const html = createInteractiveGanttHtml(project, options);
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = interactiveExportFilename(project.project.name, options.exportedAt);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
