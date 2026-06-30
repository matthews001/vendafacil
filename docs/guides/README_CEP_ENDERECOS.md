# CEP e endereços — atualização

Não há SQL novo nesta versão.

## O que mudou
- No primeiro cadastro de uma loja Delivery, o CEP, rua, número, bairro, cidade e UF passam a ser solicitados.
- Ao preencher o CEP, o sistema consulta ViaCEP e preenche o endereço automaticamente.
- O endereço completo é salvo no negócio e preparado como endereço de saída em **Entrega e frete**.
- Quando houver chave Mapbox configurada, o sistema também tenta localizar o ponto da loja usando o endereço completo, incluindo CEP.
- Na vitrine, o cliente digita o CEP e o checkout preenche rua, bairro, cidade e UF. Ele só precisa informar número e conferir os dados.

## Depois do deploy
1. Faça `Ctrl + F5` no painel e na vitrine.
2. Para lojas já criadas, abra **Entrega e frete**, revise o endereço de saída e clique em **Buscar pelo endereço** antes de salvar.
3. Teste um pedido escolhendo **Receber em casa**, informe um CEP e confirme o preenchimento automático.
