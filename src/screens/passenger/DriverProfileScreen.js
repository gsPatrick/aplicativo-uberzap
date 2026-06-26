import React from 'react';
import { View, Text, StatusBar, SafeAreaView, TouchableOpacity, ScrollView, Image, Platform, StyleSheet } from 'react-native';
import styled from 'styled-components/native';
import Icon from '../../components/AppIcon';
import { useNavigation, useRoute } from '@react-navigation/native';
import MapView from 'react-native-maps';
import { colors, spacing } from '../../theme/tokens';
import api from '../../services/api';
import SmartImage from '../../components/SmartImage';

const BackwardButton = styled.TouchableOpacity`
  position: absolute;
  top: ${Platform.OS === 'ios' ? 50 : 30}px;
  left: 20px;
  width: 44px;
  height: 44px;
  border-radius: 22px;
  background-color: rgba(255,255,255,0.9);
  justify-content: center;
  align-items: center;
  z-index: 10;
  elevation: 5;
  shadow-color: #000;
  shadow-offset: 0px 2px;
  shadow-opacity: 0.3;
  shadow-radius: 3px;
`;

const ContentCard = styled.View`
  background-color: #0B1220;
  border-top-left-radius: 35px;
  border-top-right-radius: 35px;
  margin-top: -60px;
  padding-horizontal: 25px;
  padding-top: 10px;
  padding-bottom: 50px;
  min-height: 100%;
`;

const ProfileHeader = styled.View`
  align-items: center;
  margin-top: -65px;
`;

const LargeProfileImage = styled.Image`
  width: 120px;
  height: 120px;
  border-radius: 60px;
  border-width: 5px;
  border-color: #fff;
  background-color: #131C2E;
`;

const DriverNameTitle = styled.Text`
  font-size: 26px;
  font-weight: 800;
  color: #F1F5F9;
  margin-top: 15px;
  letter-spacing: -0.5px;
`;

const DriverSubtitle = styled.Text`
  font-size: 15px;
  color: #94A3B8;
  margin-top: 4px;
  font-weight: 500;
`;

const StatsGrid = styled.View`
  flex-direction: row;
  justify-content: space-around;
  margin-top: 30px;
  padding-vertical: 20px;
  border-top-width: 1px;
  border-bottom-width: 1px;
  border-color: #243049;
`;

const StatItem = styled.View`
  align-items: center;
`;

const StatHeader = styled.View`
  flex-direction: row;
  align-items: center;
  margin-bottom: 5px;
`;

const StatValue = styled.Text`
  font-size: 22px;
  font-weight: 800;
  color: #F1F5F9;
`;

const StatLabel = styled.Text`
  font-size: 12px;
  color: #94A3B8;
  font-weight: 600;
  text-transform: uppercase;
  margin-top: 2px;
`;

const SectionTitle = styled.Text`
  font-size: 19px;
  font-weight: 700;
  color: #F1F5F9;
  margin-top: 30px;
  margin-bottom: 15px;
`;

const BadgesScroll = styled.ScrollView`
  flex-direction: row;
  margin-horizontal: -25px;
  padding-horizontal: 25px;
`;

const Badge = styled.View`
  background-color: #131C2E;
  padding-horizontal: 16px;
  padding-vertical: 12px;
  border-radius: 12px;
  margin-right: 12px;
  flex-direction: row;
  align-items: center;
  border-width: 1px;
  border-color: rgba(58, 181, 107, 0.2);
`;

const BadgeText = styled.Text`
  color: ${colors.primary};
  font-weight: 700;
  margin-left: 8px;
  font-size: 14px;
`;

const CarInfoContainer = styled.View`
  background-color: #131C2E;
  padding: 20px;
  border-radius: 20px;
  flex-direction: row;
  align-items: center;
  margin-top: 10px;
  margin-bottom: 40px;
  elevation: 5;
  shadow-color: ${colors.primary};
  shadow-offset: 0px 4px;
  shadow-opacity: 0.2;
  shadow-radius: 8px;
`;

export default function DriverProfileScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  const driver = route.params?.driver || { nome: 'Motorista', veiculo: 'Veículo', placa: 'AAA-0000' };

  // Busca o perfil completo (fotos do carro, veículo, nota) e as avaliações por id
  const [profile, setProfile] = React.useState(null);
  const [ratings, setRatings] = React.useState(null);
  React.useEffect(() => {
    if (!driver?.id) return;
    let active = true;
    (async () => {
      try {
        const res = await api.driver.getDriverProfile(driver.id);
        if (active && res?.data && typeof res.data === 'object') setProfile(res.data);
      } catch (e) {}
    })();
    (async () => {
      try {
        const res = await api.driver.getDriverRatings(driver.id);
        if (active && res?.data && typeof res.data === 'object') setRatings(res.data);
      } catch (e) {}
    })();
    return () => { active = false; };
  }, [driver?.id]);

  const d = { ...driver, ...(profile || {}) };
  const carPhotos = [d.img_frente, d.img_lateral, d.img_documento].filter(p => p && p !== 'sem_imagem.png');
  const carMain = carPhotos[0] || null;
  const isMoto = (d.veiculo || '').toLowerCase().includes('moto');

  const reviews = Array.isArray(ratings?.avaliacoes) ? ratings.avaliacoes : [];
  const totalReviews = Number(ratings?.total ?? 0);
  const media = parseFloat(String(ratings?.media ?? d.nota ?? d.rating ?? 0).replace(',', '.')) || 0;
  const hasRating = totalReviews > 0 && media > 0;
  const ratingTxt = media.toFixed(1).replace('.', ',');
  const fmtDate = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '');

  return (
    <View style={{ flex: 1, backgroundColor: '#0B1220' }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Header: foto principal do carro (escurecida, estilo hero) ou cor da marca */}
      <View style={{ height: 230, width: '100%', backgroundColor: colors.primary, overflow: 'hidden' }}>
        {carMain ? (
          <>
            <SmartImage value={carMain} style={StyleSheet.absoluteFillObject} resizeMode="cover" fallbackBg={colors.primary} fallbackIcon="directions-car" />
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(15,20,18,0.55)' }]} />
          </>
        ) : null}
        <BackwardButton onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Icon name="close" size={24} color="#0B1220" />
        </BackwardButton>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, zIndex: 5 }} contentContainerStyle={{ paddingTop: 165 }}>
        <ContentCard style={{ marginTop: 0 }}>
          <ProfileHeader style={{ zIndex: 10, elevation: 10 }}>
            <SmartImage
              value={d.img || d.foto}
              fallbackIcon="person" fallbackSize={60} fallbackBg="#131C2E" alignTop
              style={{ width: 120, height: 120, borderRadius: 60, borderWidth: 5, borderColor: '#fff', backgroundColor: '#131C2E', zIndex: 15, elevation: 15, shadowColor: '#000', shadowOffset: {width:0, height:4}, shadowOpacity: 0.3, shadowRadius: 5 }}
            />
            <DriverNameTitle>{(d.nome || 'Motorista').trim()}</DriverNameTitle>

            {/* Nível */}
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#131C2E', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginTop: 10, borderWidth: 1, borderColor: '#F59E0B' }}>
              <Icon name="workspace-premium" size={16} color="#F59E0B" />
              <Text style={{ color: '#F59E0B', fontWeight: '800', marginLeft: 6, fontSize: 13 }}>Motorista {d.nivel || 'Ouro'}</Text>
            </View>

            {/* Avaliação média */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
              {[1,2,3,4,5].map(s => (
                <Icon key={s} name="star" size={22} color={hasRating && s <= Math.round(media) ? '#F59E0B' : '#243049'} />
              ))}
              <Text style={{ marginLeft: 8, fontSize: 18, fontWeight: '800', color: '#F1F5F9' }}>{hasRating ? ratingTxt : 'Novo'}</Text>
              {totalReviews > 0 ? (
                <Text style={{ marginLeft: 6, fontSize: 13, color: '#94a3b8' }}>({totalReviews})</Text>
              ) : null}
            </View>
          </ProfileHeader>

          {/* Fotos do veículo (regra antigo -> novo) */}
          <SectionTitle>Fotos do Veículo</SectionTitle>
          {carPhotos.length > 0 ? (
            <BadgesScroll horizontal showsHorizontalScrollIndicator={false}>
              {carPhotos.map((p, i) => (
                <SmartImage key={i} value={p} style={{ width: 240, height: 150, borderRadius: 16, marginRight: 12, backgroundColor: '#131C2E' }} fallbackIcon="directions-car" />
              ))}
            </BadgesScroll>
          ) : (
            <View style={{ height: 140, borderRadius: 16, backgroundColor: '#131C2E', borderWidth: 1, borderColor: '#243049', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' }}>
              <Icon name="no-photography" size={30} color="#94A3B8" />
              <Text style={{ color: '#94a3b8', marginTop: 8 }}>Sem fotos do veículo</Text>
            </View>
          )}

          {/* Veículo */}
          <SectionTitle>Veículo</SectionTitle>
          <CarInfoContainer style={{ marginBottom: 25 }}>
             <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 18 }}>
               <Icon name={isMoto ? 'motorcycle' : 'directions-car'} size={34} color={colors.primary} />
             </View>
             <View style={{ flex: 1 }}>
               <Text style={{ fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: 1 }}>{d.placa || '—'}</Text>
               <Text style={{ fontSize: 15, color: '#94A3B8', marginTop: 2, fontWeight: '500' }}>{(d.veiculo || 'Veículo').trim()}</Text>
             </View>
          </CarInfoContainer>

          {/* Avaliações reais */}
          <SectionTitle>Avaliações {totalReviews > 0 ? `(${totalReviews})` : ''}</SectionTitle>
          {reviews.length > 0 ? (
            reviews.map((r, i) => (
              <View key={i} style={{ backgroundColor: '#131C2E', borderRadius: 16, padding: 16, marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ fontWeight: '800', color: '#F1F5F9', fontSize: 15 }}>{r.nome_cliente || 'Passageiro'}</Text>
                  <Text style={{ color: '#94a3b8', fontSize: 12 }}>{fmtDate(r.date)}</Text>
                </View>
                <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                  {[1,2,3,4,5].map(s => (
                    <Icon key={s} name="star" size={15} color={s <= (r.nota || 0) ? '#F59E0B' : '#243049'} />
                  ))}
                </View>
                {!!(r.comentario || '').trim() && (
                  <Text style={{ color: '#94A3B8', fontSize: 14, fontStyle: 'italic' }}>"{r.comentario}"</Text>
                )}
              </View>
            ))
          ) : (
            <View style={{ backgroundColor: '#131C2E', borderRadius: 16, padding: 22, alignItems: 'center', marginBottom: 10 }}>
              <Icon name="rate-review" size={30} color="#94A3B8" />
              <Text style={{ color: '#94a3b8', marginTop: 8, textAlign: 'center' }}>Este motorista ainda não tem avaliações.</Text>
            </View>
          )}
        </ContentCard>
      </ScrollView>
    </View>
  );
}
