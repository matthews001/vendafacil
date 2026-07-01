# Entrega por CEP + raio (sem mapa)

## O que continua
- **Faixas de CEP**: prioridade para cobranças específicas por área.
- O cliente informa apenas o CEP; ele não precisa conhecer a faixa cadastrada.

## Nova segunda opção: raio
- O dono marca “Entrega por raio”, define km, frete, mínimo e prazo.
- Estando fisicamente na loja, toca em **Usar minha localização atual** e salva.
- Caso o CEP do cliente não entre em uma faixa, a vitrine oferece “Usar minha localização”.
- A distância é em **linha reta**, sem mapa, rota, Geocoding ou Directions.
- O PDV continua usando CEP, porque a localização do computador do caixa não é a localização do cliente.

## Aplicação
1. No Supabase, rode `20260628_18_entrega_por_raio_sem_mapa.sql` uma única vez.
2. Suba este projeto completo no GitHub.
3. Após a Cloudflare Pages publicar, faça Ctrl+F5.
4. Em **Entrega e frete**, configure as faixas de CEP e/ou o raio.

## Custo
- Consulta de CEP: ViaCEP.
- Raio: geolocalização do próprio navegador.
- Esta versão não renderiza mapa, não chama Mapbox Geocoding e não chama Directions.
