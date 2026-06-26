import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StatusBar, Platform, Linking, AppState } from 'react-native';
import styled from 'styled-components/native';
import Icon from '../../components/AppIcon';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing } from '../../theme/tokens';
import {
  ensureNotificationPermissions,
  registerForPushNotificationsAsync,
} from '../../utils/notifications';
import { requestRideNotificationPermission } from '../../services/rideNotification';
import { requestOverlayPermission, canDrawOverlays } from '../../utils/androidOverlay';
import { canUseFullScreenIntent, openFullScreenIntentSettings } from '../../utils/fullScreenIntent';
import { syncPushTokenWithServer } from '../../services/pushSync';

export const PERMISSIONS_ONBOARDED_KEY = '@UbeZap:permissionsOnboarded';

const Container = styled.View`
  flex: 1;
  background-color: ${colors.background};
  padding: ${Platform.OS === 'ios' ? 60 : 40}px 24px 30px;
`;

const ProgressRow = styled.View`
  flex-direction: row;
  gap: 8px;
  margin-bottom: 40px;
`;

const Dot = styled.View`
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background-color: ${(props) => (props.active ? colors.primary : '#243049')};
`;

const IconCircle = styled.View`
  width: 110px;
  height: 110px;
  border-radius: 55px;
  background-color: ${(props) => props.bg || 'rgba(58,181,107,0.12)'};
  align-items: center;
  justify-content: center;
  align-self: center;
  margin-bottom: 30px;
`;

const Title = styled.Text`
  font-size: 26px;
  font-weight: 800;
  color: ${colors.text};
  text-align: center;
  margin-bottom: 14px;
`;

const Desc = styled.Text`
  font-size: 16px;
  color: #64748b;
  text-align: center;
  line-height: 24px;
`;

const StepCount = styled.Text`
  font-size: 13px;
  font-weight: 700;
  color: ${colors.primary};
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 16px;
`;

const PrimaryButton = styled.TouchableOpacity`
  background-color: ${colors.primary};
  height: 56px;
  border-radius: 16px;
  align-items: center;
  justify-content: center;
  margin-top: 16px;
`;

const PrimaryText = styled.Text`
  color: #fff;
  font-size: 17px;
  font-weight: 800;
`;

const SkipButton = styled.TouchableOpacity`
  align-items: center;
  padding: 16px;
  margin-top: 4px;
`;

const SkipText = styled.Text`
  color: #94a3b8;
  font-size: 14px;
  font-weight: 600;
`;

const GrantedBadge = styled.View`
  flex-direction: row;
  align-items: center;
  align-self: center;
  background-color: rgba(58,181,107,0.12);
  padding: 6px 14px;
  border-radius: 20px;
  margin-top: 18px;
`;

const STEPS = [
  {
    key: 'notifications',
    icon: 'notifications-active',
    title: 'Notificações',
    desc: 'Para você receber as chamadas de corrida na hora, mesmo com o app em segundo plano.',
    cta: 'Permitir notificações',
  },
  {
    key: 'location',
    icon: 'my-location',
    title: 'Localização o tempo todo',
    desc: 'Para receber corridas próximas e atualizar sua posição mesmo com o app fechado. Escolha "Permitir o tempo todo".',
    cta: 'Permitir localização',
  },
  {
    key: 'battery',
    icon: 'battery-charging-full',
    title: 'Otimização de bateria',
    desc: 'Desative a otimização de bateria do UbeZap para o sistema não fechar o app e você não perder corridas.',
    cta: 'Abrir configurações',
  },
  {
    key: 'overlay',
    icon: 'layers',
    title: 'Exibir sobre outros apps',
    desc: 'Para o alerta de corrida aparecer por cima de qualquer tela, mesmo usando outro aplicativo.',
    cta: 'Permitir sobreposição',
  },
  {
    key: 'fullscreen',
    icon: 'phone',
    title: 'Chamada em tela cheia',
    desc: 'OBRIGATÓRIO: para a corrida tocar e abrir em TELA CHEIA (estilo ligação) mesmo com o celular bloqueado. Ative "Notificações em tela cheia" para o UbeZap.',
    cta: 'Ativar tela cheia',
    required: true,
  },
];

export default function DriverPermissionsScreen() {
  const navigation = useNavigation();
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [granted, setGranted] = useState(false);

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  const finish = async () => {
    try {
      await AsyncStorage.setItem(PERMISSIONS_ONBOARDED_KEY, '1');
    } catch (e) {}
    navigation.reset({ index: 0, routes: [{ name: 'DriverHome' }] });
  };

  const goNext = async () => {
    setGranted(false);
    if (isLast) {
      await finish();
    } else {
      setStepIndex((i) => i + 1);
    }
  };

  const requestCurrent = async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (step.key === 'notifications') {
        const ok = await ensureNotificationPermissions();
        await requestRideNotificationPermission().catch(() => {});
        await registerForPushNotificationsAsync().catch(() => {});
        await syncPushTokenWithServer().catch(() => {});
        setGranted(Boolean(ok));
      } else if (step.key === 'location') {
        const { status: fg } = await Location.requestForegroundPermissionsAsync();
        let bgOk = false;
        if (fg === 'granted') {
          try {
            const { status: bg } = await Location.requestBackgroundPermissionsAsync();
            bgOk = bg === 'granted';
          } catch (e) {}
        }
        setGranted(fg === 'granted');
      } else if (step.key === 'battery') {
        // Não há API direta; abre as configurações do app para o usuário desativar.
        if (Platform.OS === 'android') {
          await Linking.openSettings().catch(() => {});
        }
        setGranted(true);
      } else if (step.key === 'overlay') {
        if (Platform.OS === 'android') {
          await requestOverlayPermission().catch(() => {});
          // A permissão de sobreposição é concedida em outra tela do sistema;
          // confirmamos ao voltar pro app.
          const has = await canDrawOverlays().catch(() => false);
          setGranted(Boolean(has));
        } else {
          setGranted(true);
        }
      } else if (step.key === 'fullscreen') {
        if (Platform.OS === 'android') {
          const has = await canUseFullScreenIntent().catch(() => false);
          if (has) {
            setGranted(true);
          } else {
            // Abre a tela do sistema; confirmamos ao voltar pro app (AppState).
            await openFullScreenIntentSettings().catch(() => {});
          }
        } else {
          setGranted(true);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // Ao voltar do sistema (bateria/sobreposição), re-checa a sobreposição.
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', async (s) => {
      if (s !== 'active') return;
      if (step.key === 'overlay') {
        const has = await canDrawOverlays().catch(() => false);
        if (has) setGranted(true);
      } else if (step.key === 'fullscreen') {
        const has = await canUseFullScreenIntent().catch(() => false);
        if (has) setGranted(true);
      }
    });
    return () => sub.remove();
  }, [step.key]);

  // Ao entrar num passo obrigatório, já verifica se a permissão existe.
  React.useEffect(() => {
    let alive = true;
    (async () => {
      if (step.key === 'fullscreen') {
        const has = await canUseFullScreenIntent().catch(() => false);
        if (alive && has) setGranted(true);
      }
    })();
    return () => { alive = false; };
  }, [step.key]);

  return (
    <Container>
      <StatusBar barStyle="light-content" backgroundColor="#0B1220" />

      <ProgressRow>
        {STEPS.map((s, i) => (
          <Dot key={s.key} active={i <= stepIndex} />
        ))}
      </ProgressRow>

      <View style={{ flex: 1, justifyContent: 'center' }}>
        <StepCount>
          Passo {stepIndex + 1} de {STEPS.length}
        </StepCount>

        <IconCircle>
          <Icon name={step.icon} size={56} color={colors.primary} />
        </IconCircle>

        <Title>{step.title}</Title>
        <Desc>{step.desc}</Desc>

        {granted ? (
          <GrantedBadge>
            <Icon name="check-circle" size={18} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: '700', marginLeft: 6 }}>
              Tudo certo!
            </Text>
          </GrantedBadge>
        ) : null}
      </View>

      {granted ? (
        <PrimaryButton activeOpacity={0.85} onPress={goNext}>
          <PrimaryText>{isLast ? 'Concluir' : 'Continuar'}</PrimaryText>
        </PrimaryButton>
      ) : (
        <PrimaryButton activeOpacity={0.85} onPress={requestCurrent} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <PrimaryText>{step.cta}</PrimaryText>}
        </PrimaryButton>
      )}

      {step.required && !granted ? (
        <View style={{ padding: 16, marginTop: 4 }}>
          <Text style={{ color: '#64748b', fontSize: 13, textAlign: 'center' }}>
            Este passo é obrigatório para receber as corridas.
          </Text>
        </View>
      ) : (
        <SkipButton onPress={goNext} disabled={loading}>
          <SkipText>{isLast ? 'Concluir mais tarde' : 'Pular este passo'}</SkipText>
        </SkipButton>
      )}
    </Container>
  );
}
