import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const html=await readFile(resolve(root,'src/templates/index.template.html'),'utf8');
const required=[
  'vfPdv7LookupCep:()=>lookupCep({announce:true})',
  'https://viacep.com.br/ws/',
  'function calculate()',
  'const routeFresh=data=>',
  'vf_pos_create_delivery_sale',
  'data-vf-pdv7-field="cep"',
  'data-vf-pdv7-field="city"',
  'data-vf-pdv7-field="state"',
  'Valide o CEP antes de salvar.',
  'Este CEP não está dentro de uma área de entrega cadastrada.'
];
for(const token of required) if(!html.includes(token)) throw new Error('PDV entrega por CEP incompleto: '+token);
const pdvStart=html.indexOf('vfPdv7LookupCep:()=>lookupCep({announce:true})');
const pdvBlock=html.slice(pdvStart, pdvStart+60000);
for(const forbidden of ['api.mapbox.com','new mapboxgl.Map','directions/v5']) if(pdvBlock.includes(forbidden)) throw new Error('PDV não pode consumir mapa/rota: '+forbidden);
console.log('PDV validado: CEP preenche endereço, aplica faixa cadastrada e salva entrega sem mapa.');
