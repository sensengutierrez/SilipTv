package com.storepos.app

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * Classic Bluetooth (SPP) thermal printer. Kailangang naka-pair muna sa Settings ng phone.
 * Pinapanatiling bukas ang koneksyon para mabilis ang susunod na print.
 */
@SuppressLint("MissingPermission")
object BtPrinter {
    private val SPP: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    private var socket: BluetoothSocket? = null
    private var address: String? = null

    private fun adapter(c: Context): BluetoothAdapter? =
        (c.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    fun paired(c: Context): String {
        val a = adapter(c) ?: throw RuntimeException("Walang Bluetooth ang device na ito.")
        if (!a.isEnabled) throw RuntimeException("Naka-off ang Bluetooth. I-on muna.")
        val arr = JSONArray()
        // Printer muna sa itaas ng listahan
        a.bondedDevices
            .sortedByDescending { it.bluetoothClass?.majorDeviceClass == BluetoothClass.Device.Major.IMAGING }
            .forEach { d -> arr.put(JSONObject().put("name", d.name ?: "").put("address", d.address)) }
        return arr.toString()
    }

    @Synchronized
    fun print(c: Context, addr: String, data: ByteArray) {
        val a = adapter(c) ?: throw RuntimeException("Walang Bluetooth ang device na ito.")
        if (!a.isEnabled) throw RuntimeException("Naka-off ang Bluetooth. I-on muna.")
        var lastErr: Exception? = null
        for (attempt in 0 until 2) {
            try {
                val s = connect(a, addr)
                val out = s.outputStream
                var i = 0
                while (i < data.size) {
                    val n = minOf(1024, data.size - i)
                    out.write(data, i, n)
                    out.flush()
                    i += n
                    Thread.sleep(15)
                }
                return
            } catch (e: Exception) {
                lastErr = e
                close()
            }
        }
        throw RuntimeException("Hindi makakonekta sa printer. Naka-on ba ito at malapit? (${lastErr?.message ?: ""})")
    }

    private fun connect(a: BluetoothAdapter, addr: String): BluetoothSocket {
        socket?.let { if (it.isConnected && address == addr) return it }
        close()
        a.cancelDiscovery()
        val dev = a.getRemoteDevice(addr)
        val s = try {
            dev.createRfcommSocketToServiceRecord(SPP).also { it.connect() }
        } catch (e: Exception) {
            // Ilang murang printer: kailangan ng insecure socket
            dev.createInsecureRfcommSocketToServiceRecord(SPP).also { it.connect() }
        }
        socket = s
        address = addr
        return s
    }

    fun close() {
        try { socket?.close() } catch (_: Exception) {}
        socket = null
        address = null
    }
}
