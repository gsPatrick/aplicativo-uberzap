const mysql = require('mysql2/promise');
const crypto = require('crypto');

async function createDriver() {
  const connection = await mysql.createConnection({
    host: '69.62.99.122',
    user: 'uberzapbd',
    password: 'uberzapbd',
    database: 'uberzapbd',
    port: 1212
  });

  const rawPassword = "patrickteste";
  const salt = "anjdsn5s141d5";
  const hash = crypto.createHash('md5').update(rawPassword + salt).digest('hex');

  const driverPhone = "11988887777";
  const driverCpf = "999.888.777-00";

  // Check if driver exists
  const [rows] = await connection.execute('SELECT * FROM motoristas WHERE telefone = ? OR cpf = ?', [driverPhone, driverCpf]);
  if (rows.length > 0) {
    console.log("Motorista já existe. Apagando anterior...");
    await connection.execute('DELETE FROM motoristas WHERE telefone = ? OR cpf = ?', [driverPhone, driverCpf]);
  }

  const sql = `
    INSERT INTO motoristas (
      cidade_id, nome, email, cpf, img, veiculo, placa, telefone, senha, taxa, saldo, ids_categorias, ativo, online
    ) VALUES (
      1, 'Motorista de Teste', 'driver@test.com', ?, 'default.jpg', 'Carro de Teste', 'TST-2026', ?, ?, 15, 100.00, '[1,2,3]', 1, 0
    )
  `;

  await connection.execute(sql, [driverCpf, driverPhone, hash]);

  console.log("✅ Motorista criado com sucesso no banco de dados!");
  console.log("CPF: " + driverCpf);
  console.log("Senha: " + rawPassword);

  await connection.end();
}

createDriver().catch(console.error);
