import streamlit as st
import requests

st.set_page_config(page_title="Tech Fault RAG Bot")
st.title("Tech Fault RAG Bot")

question = st.text_input("Ask a troubleshooting question")

if st.button("Ask") and question:
    response = requests.post(
        "http://127.0.0.1:8000/ask",
        json={"question": question, "top_k": 5},
        timeout=60,
    )

    data = response.json()

    st.subheader("Answer")
    st.write(data["answer"])

    st.subheader("Retrieved Chunks")
    for i, chunk in enumerate(data["retrieved_chunks"], start=1):
        with st.expander(
            f"Source {i}: {chunk['source']} | page {chunk['page']} | chunk {chunk['chunk_index']}"
        ):
            st.write(chunk["text"])