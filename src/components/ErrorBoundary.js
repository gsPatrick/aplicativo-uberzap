import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Clipboard, Alert, DevSettings } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleCopyToClipboard = () => {
    if (this.state.error) {
      Clipboard.setString(
        `Erro: ${this.state.error.message}\n\nStack: ${this.state.error.stack}\n\nInfo: ${JSON.stringify(this.state.errorInfo)}`
      );
      Alert.alert('Copiado', 'Os detalhes do erro foram copiados para a área de transferência.');
    }
  };

  handleResetApp = async () => {
    try {
      // Limpa dados de sessão e reinicia o aplicativo
      await AsyncStorage.multiRemove(['@Uberzap:session', 'driverId']);
      Alert.alert('Reiniciando', 'O armazenamento local foi limpo. O aplicativo será reiniciado agora.', [
        {
          text: 'OK',
          onPress: () => {
            if (DevSettings && DevSettings.reload) {
              DevSettings.reload();
            } else {
              // Fallback
              this.setState({ hasError: false, error: null, errorInfo: null });
            }
          }
        }
      ]);
    } catch (e) {
      this.setState({ hasError: false, error: null, errorInfo: null });
    }
  };

  handleRestartOnly = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <View style={styles.iconContainer}>
              <Text style={styles.warningIcon}>⚠️</Text>
            </View>
            <Text style={styles.title}>Ops! Algo deu errado</Text>
            <Text style={styles.subtitle}>
              O aplicativo encontrou um problema inesperado. Por favor, tire um print ou copie o erro abaixo para nos enviar.
            </Text>

            <ScrollView style={styles.errorLog} contentContainerStyle={styles.scrollContent}>
              <Text style={styles.errorText}>
                {this.state.error && this.state.error.toString()}
              </Text>
              <Text style={styles.stackText}>
                {this.state.error && this.state.error.stack}
              </Text>
            </ScrollView>

            <TouchableOpacity style={styles.copyButton} onPress={this.handleCopyToClipboard}>
              <Text style={styles.copyButtonText}>COPIAR DETALHES DO ERRO</Text>
            </TouchableOpacity>

            <View style={styles.row}>
              <TouchableOpacity style={[styles.actionButton, styles.resetButton]} onPress={this.handleResetApp}>
                <Text style={styles.actionButtonText}>LIMPAR E REINICIAR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButton, styles.restartButton]} onPress={this.handleRestartOnly}>
                <Text style={styles.actionButtonText}>TENTAR DE NOVO</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  warningIcon: {
    fontSize: 30,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  errorLog: {
    width: '100%',
    maxHeight: 180,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  scrollContent: {
    paddingBottom: 10,
  },
  errorText: {
    color: '#f87171',
    fontWeight: 'bold',
    fontFamily: 'monospace',
    fontSize: 12,
    marginBottom: 8,
  },
  stackText: {
    color: '#cbd5e1',
    fontFamily: 'monospace',
    fontSize: 10,
  },
  copyButton: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  copyButtonText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: 'bold',
  },
  row: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
  },
  actionButton: {
    flex: 0.48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resetButton: {
    backgroundColor: '#fee2e2',
  },
  restartButton: {
    backgroundColor: '#ffc107',
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1e293b',
  },
});
