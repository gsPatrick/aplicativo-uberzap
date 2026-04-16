# UbeZap Frontend - React Native Refactor

Este repositório contém a nova interface móvel do ecossistema UbeZap, desenvolvida em React Native para substituir a versão antiga em Kodular.

## 🚀 Tecnologias e Dependências Iniciais

Para iniciar o desenvolvimento, instale as seguintes dependências:

### Core & Navegação
- `react-navigation/native` & `react-navigation/stack`: Gerenciamento de rotas.
- `react-native-screens` & `react-native-safe-area-context`: Otimização de interfaces.

### Integração & Dados
- `axios`: Cliente HTTP para consumir a API PHP existente.
- `@react-native-community/async-storage`: Persistência de dados local (Tokens, Sessão).

### Design & UI
- `styled-components/native`: Estilização via CSS-in-JS.
- `react-native-vector-icons`: Ícones (MaterialIcons, FontAwesome).
- `lottie-react-native`: Animações fluidas e modernas.

### Mapas & Localização
- `react-native-maps`: Exibição de mapas.
- `react-native-geolocation-service`: Captura precisa de coordenadas.

---

## 📂 Estrutura de Pastas

```text
frontend/
├── src/
│   ├── assets/        # Imagens, Lottie files e Fontes
│   ├── components/    # Componentes atômicos e globais
│   ├── config/        # Configurações de chaves e URLs de API
│   ├── hooks/         # Hooks customizados
│   ├── navigation/    # Configuração de Stack/Tab Navigators
│   ├── screens/       # Telas que compõem o fluxo do app
│   ├── services/      # Abstração de chamadas à API (Axios)
│   ├── theme/         # Design System (Cores, Espaçamentos)
│   └── utils/         # Funções utilitárias (Formatação de CPF, Datas)
├── App.js             # Ponto de entrada da aplicação
└── package.json       # Manifesto de dependências
```

## 🎨 Identidade Visual
- **Primary Green**: `#28a745` (Vibrante, corporativo)
- **Background**: `#FFFFFF`
- **Text/Secondary**: `#252A2D` (Dark Gray)

## 🛠️ Próximos Passos
1. Implementar o `src/services/api.js` com a base URL do cPanel.
2. Criar o fluxo de autenticação (Login com CPF e Senha).
3. Desenvolver o hook de localização persistente para motoristas.
