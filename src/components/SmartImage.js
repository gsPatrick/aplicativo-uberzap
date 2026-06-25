import React, { useState, useEffect } from 'react';
import { Image, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import api from '../services/api';

/**
 * Imagem com fallback de domínio.
 * Tenta o domínio ANTIGO primeiro (top.uberzap.app.br — tem as imagens das
 * contas antigas) e, se der erro/404, cai pro NOVO (easypanel). Aceita também
 * URI local (file://) e URL http completa. Sem imagem válida -> placeholder.
 *
 * Props:
 *  - value: nome do arquivo (ex.: "62331.png"), URI local ou URL completa
 *  - style: estilo da imagem/placeholder
 *  - resizeMode, fallbackIcon, fallbackSize, fallbackBg
 *  - alignTop: em fotos retrato, ancora o TOPO (mostra o rosto em avatar de
 *    corpo inteiro) em vez de cortar no centro.
 */
const SmartImage = ({
  value,
  style,
  resizeMode = 'cover',
  fallbackIcon = 'image-not-supported',
  fallbackSize = 26,
  fallbackBg = '#1B2740',
  alignTop = false,
}) => {
  const candidates = api.getImageCandidates(value);
  const [idx, setIdx] = useState(0);
  const [ratio, setRatio] = useState(null); // largura/altura

  // Reinicia a tentativa quando o value muda
  useEffect(() => { setIdx(0); setRatio(null); }, [value]);

  if (!candidates.length || idx >= candidates.length) {
    return (
      <View style={[{ backgroundColor: fallbackBg, justifyContent: 'center', alignItems: 'center' }, style]}>
        <Icon name={fallbackIcon} size={fallbackSize} color="#cbd5e1" />
      </View>
    );
  }

  const onError = () => setIdx((i) => i + 1);
  const onLoad = (e) => {
    const src = e?.nativeEvent?.source;
    if (src?.width && src?.height) setRatio(src.width / src.height);
  };

  // Modo "alignTop": para fotos retrato (mais altas que largas), desenha a
  // imagem em largura cheia com a proporção natural, ancorada ao topo, e o
  // contêiner (overflow hidden) corta o excesso embaixo — preservando o rosto.
  if (alignTop && ratio && ratio < 1) {
    return (
      <View style={[{ overflow: 'hidden', alignItems: 'flex-start', justifyContent: 'flex-start' }, style]}>
        <Image
          source={{ uri: candidates[idx] }}
          style={{ width: '100%', aspectRatio: ratio }}
          resizeMode="cover"
          onError={onError}
          onLoad={onLoad}
        />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: candidates[idx] }}
      style={style}
      resizeMode={resizeMode}
      onError={onError}
      onLoad={onLoad}
    />
  );
};

export default SmartImage;
