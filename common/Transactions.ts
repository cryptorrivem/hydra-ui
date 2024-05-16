import type { Wallet } from '@saberhq/solana-contrib'
import {
  ComputeBudgetProgram,
  ConfirmOptions,
  Connection,
  PublicKey,
  Signer,
  Transaction,
  TransactionInstruction,
  sendAndConfirmRawTransaction,
} from '@solana/web3.js'
import { notify } from 'common/Notification'

function getTransaction({
  instructions,
  payer,
  blockhash,
  units,
}: {
  instructions: TransactionInstruction[]
  payer: PublicKey
  blockhash: string
  units?: number
}) {
  units = units || 400_000 + 25_000
  const microLamports = Math.ceil((10_000 * 10 ** 6) / units)
  const tx = new Transaction()
  tx.feePayer = payer
  tx.recentBlockhash = blockhash
  tx.instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
    ...instructions,
  ]
  return tx
}

export const executeTransaction = async (
  connection: Connection,
  wallet: Wallet,
  instructions: TransactionInstruction[],
  config: {
    silent?: boolean
    signers?: Signer[]
    confirmOptions?: ConfirmOptions
    notificationConfig?: {
      message?: string
      errorMessage?: string
      description?: string
    }
    callback?: () => void
  }
): Promise<string> => {
  let txid = ''
  try {
    const { blockhash } = await connection.getLatestBlockhash('finalized')
    let transaction = getTransaction({
      instructions,
      payer: wallet.publicKey,
      blockhash,
    })
    const result = await connection.simulateTransaction(transaction)
    transaction = getTransaction({
      instructions,
      payer: wallet.publicKey,
      blockhash,
      units: result.value.unitsConsumed,
    })
    transaction = await wallet.signTransaction(transaction)
    if (config.signers && config.signers.length > 0) {
      await transaction.partialSign(...config.signers)
    }
    txid = await sendAndConfirmRawTransaction(
      connection,
      transaction.serialize(),
      { ...config.confirmOptions, skipPreflight: true }
    )
    console.log('Successful tx', txid)
    config.notificationConfig &&
      notify({
        message: 'Succesful transaction',
        description: config.notificationConfig.message,
        txid,
      })
  } catch (e) {
    console.log('Failed transaction: ', e)
    config.notificationConfig &&
      notify({
        message: 'Failed transaction',
        description: config.notificationConfig.errorMessage ?? `${e}`,
        txid,
        type: 'error',
      })
    if (!config.silent) throw new Error(`${e}`)
  } finally {
    config.callback && config.callback()
  }
  return txid
}
