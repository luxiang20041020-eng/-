// 模拟文档版本冲突、原子提交和事务重试；普通测试的内存数据库不会模拟并发。
function enableOptimisticTransactions(state) {
  const signature = value => JSON.stringify(value)
  state.conflicts = 0
  state.db.runTransaction = async callback => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const snapshot = new Map([...state.collections].map(([name, rows]) => [name, new Map([...rows].map(([id, row]) => [id, { ...row }]))]))
      const reads = new Map(), writes = new Map()
      const touch = (name, id) => { const key = name + ':' + id; if (!reads.has(key)) reads.set(key, { name, id, before: signature(snapshot.get(name).get(id)) }); return key }
      const tx = { collection(name) {
        const doc = id => ({
          async get() { touch(name,id); const data = snapshot.get(name).get(id); if (!data) throw new Error('document.get:fail document with _id\n' + id + ' does not exist'); return { data: { ...data } } },
          async set({data}) { const key = touch(name,id); snapshot.get(name).set(id,{...data,_id:id}); writes.set(key,{name,id}) },
          async update({data}) { const key=touch(name,id), previous=snapshot.get(name).get(id); if(!previous)throw Error('document does not exist'); const next={...previous};for(const [field,value]of Object.entries(data))next[field]=value&&value.increment!==undefined?Number(next[field]||0)+value.increment:value;snapshot.get(name).set(id,next);writes.set(key,{name,id}) },
        })
        return { doc, async add({data}) { const id=data._id||'parallel_'+(++state.nextId);await doc(id).set({data});return {_id:id} } }
      } }
      const result = await callback(tx)
      const conflict=[...reads.values()].some(({name,id,before})=>signature(state.collections.get(name).get(id))!==before)
      if(conflict){ state.conflicts++; continue }
      for(const {name,id} of writes.values())state.collections.get(name).set(id,snapshot.get(name).get(id))
      return state.transactionEnvelope?{result,errMsg:'runTransaction:ok'}:result
    }
    throw Error('transaction retries exhausted')
  }
}
module.exports = { enableOptimisticTransactions }
